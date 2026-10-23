import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { DrugService } from './drug.service';
import { PhotoRecognizeDto } from './dto/photo-recognize.dto';
import { SearchDrugsQueryDto } from './dto/search-drugs.query';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * 识别提示词（红线：只提取药名，禁止任何用法/用量/适应症等医疗信息输出；
 * 结果只作搜索回填，药品数据一律以药品库命中为准，识别永不直接入库）。
 */
const RECOGNIZE_PROMPT =
  '你是药品包装文字识别助手。只从图片中提取药品的通用名（若包装只有商品名则提取商品名）。' +
  '只输出 JSON：{"candidates":["药名1","药名2"]}，最多 3 个，按可能性从高到低排序。' +
  '看不清或图片不是药品时输出 {"candidates":[]}。' +
  '禁止输出用法、用量、适应症等任何其他信息，禁止输出解释文字。';

export interface PhotoRecognizeResult {
  candidates: { text: string; matches: unknown[] }[];
}

@Injectable()
export class DrugPhotoService {
  private readonly logger = new Logger(DrugPhotoService.name);

  constructor(
    private readonly gateway: AiGatewayService,
    private readonly drugs: DrugService,
  ) {}

  async recognize(
    dto: PhotoRecognizeDto,
    user?: AuthenticatedUser,
  ): Promise<PhotoRecognizeResult> {
    let bytes: Buffer;
    try {
      bytes = Buffer.from(dto.imageBase64, 'base64');
    } catch {
      bytes = Buffer.alloc(0);
    }
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
      throw new BusinessException(
        BusinessCode.BadRequest,
        '图片无效或超过 5MB，请重拍一张更清晰的照片',
        HttpStatus.BAD_REQUEST,
      );
    }
    const dataUrl = 'data:' + dto.mimeType + ';base64,' + dto.imageBase64;
    const { content } = await this.gateway.chatCompletion({
      capability: 'photo_recognize',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: RECOGNIZE_PROMPT },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      maxTokens: 300,
      timeoutMs: 30_000,
    });
    const texts = this.parseCandidates(content);
    const candidates: PhotoRecognizeResult['candidates'] = [];
    for (const text of texts) {
      let matches: unknown[] = [];
      try {
        const query = new SearchDrugsQueryDto();
        query.q = text;
        query.page = 1;
        query.pageSize = 3;
        const found = await this.drugs.search(query, user);
        matches = (found as { items?: unknown[] }).items ?? [];
      } catch (err) {
        this.logger.warn(
          `拍照识别候选检索失败：${err instanceof Error ? err.name : 'unknown'}`,
        );
      }
      candidates.push({ text, matches });
    }
    return { candidates };
  }

  /** 容错解析：截取首尾大括号内的 JSON，只取字符串候选，去重截断。 */
  private parseCandidates(content: string): string[] {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start < 0 || end <= start) return [];
    try {
      const parsed = JSON.parse(content.slice(start, end + 1)) as {
        candidates?: unknown;
      };
      if (!Array.isArray(parsed.candidates)) return [];
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of parsed.candidates) {
        if (typeof raw !== 'string') continue;
        const text = raw.trim().slice(0, 50);
        if (text && !seen.has(text)) {
          seen.add(text);
          out.push(text);
        }
        if (out.length >= 3) break;
      }
      return out;
    } catch {
      return [];
    }
  }
}

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BindWechatConfirmDto } from './dto/auth.dto';
import { InMemoryScanLoginTicketStore, ScanLoginTicketStore } from './scan-login-ticket.store';
import { AuthService } from './auth.service';
import { BusinessException } from '../../common/exceptions/business.exception';

describe('Auth WeChat Bind Scan Confirmation', () => {
  describe('BindWechatConfirmDto validation', () => {
    it('accepts valid ticketId (uuid) and code', async () => {
      const dto = plainToInstance(BindWechatConfirmDto, {
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        code: 'wx-code-123',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects missing or invalid ticketId with Chinese error', async () => {
      const dto = plainToInstance(BindWechatConfirmDto, {
        ticketId: 'not-a-uuid',
        code: 'wx-code-123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const ticketErr = errors.find((e) => e.property === 'ticketId');
      expect(ticketErr).toBeDefined();
      expect(Object.values(ticketErr?.constraints ?? {}).join('')).toContain('格式不正确');
    });

    it('rejects empty code with Chinese error', async () => {
      const dto = plainToInstance(BindWechatConfirmDto, {
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        code: '',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const codeErr = errors.find((e) => e.property === 'code');
      expect(codeErr).toBeDefined();
      expect(Object.values(codeErr?.constraints ?? {}).join('')).toContain('不能为空');
    });
  });

  describe('ScanLoginTicketStore & bind ticket flow', () => {
    let store: ScanLoginTicketStore;

    beforeEach(() => {
      store = new InMemoryScanLoginTicketStore();
    });

    it('separates bind_wechat and login purpose', async () => {
      await store.create({
        id: 'ticket-1',
        status: 'pending',
        purpose: 'bind_wechat',
        ownerAccountId: 'acc-1',
        createdAt: Date.now(),
        expiresAt: Date.now() + 300_000,
      });

      const raw = await store.getRaw('ticket-1');
      expect(raw).toBeDefined();
      expect(raw?.purpose).toBe('bind_wechat');
      expect(raw?.ownerAccountId).toBe('acc-1');
    });
  });

  describe('AuthService bind ticket methods', () => {
    let service: AuthService;
    let store: ScanLoginTicketStore;
    let mockPrisma: any;
    let mockWechat: any;

    beforeEach(() => {
      store = new InMemoryScanLoginTicketStore();
      mockPrisma = {
        userAccount: {
          findFirst: jest.fn(),
        },
        userOauthBinding: {
          findFirst: jest.fn(),
          create: jest.fn(),
        },
      };
      mockWechat = {
        jscode2session: jest.fn(),
      };
      service = new AuthService(
        mockPrisma,
        null as any,
        null as any,
        null as any,
        null as any,
        mockWechat,
        store,
        null as any,
      );
    });

    it('createBindTicket creates ticket with 5 min expiry and bind: prefix qrContent', async () => {
      jest.spyOn(service as any, 'findAccountById').mockResolvedValue({
        id: 'acc-1',
        status: 'active',
      });

      const res = await service.createBindTicket('acc-1');
      expect(res.ticketId).toBeDefined();
      expect(res.expiresInSeconds).toBe(300);
      expect(res.qrContent).toBe(`bind:${res.ticketId}`);

      const saved = await store.getRaw(res.ticketId);
      expect(saved?.purpose).toBe('bind_wechat');
      expect(saved?.ownerAccountId).toBe('acc-1');
      expect(saved?.status).toBe('pending');
    });

    it('getBindTicket returns pending, confirmed, or expired; forbids other accounts', async () => {
      await store.create({
        id: 'ticket-2',
        status: 'pending',
        purpose: 'bind_wechat',
        ownerAccountId: 'acc-1',
        createdAt: Date.now(),
        expiresAt: Date.now() + 300_000,
      });

      // Same account -> pending
      const status1 = await service.getBindTicket('ticket-2', 'acc-1');
      expect(status1).toEqual({ status: 'pending' });

      // Other account -> 403 Forbidden
      await expect(service.getBindTicket('ticket-2', 'acc-2')).rejects.toThrow(
        BusinessException,
      );

      // Expired ticket -> expired
      await store.create({
        id: 'ticket-expired',
        status: 'pending',
        purpose: 'bind_wechat',
        ownerAccountId: 'acc-1',
        createdAt: Date.now() - 400_000,
        expiresAt: Date.now() - 100_000,
      });
      const statusExpired = await service.getBindTicket('ticket-expired', 'acc-1');
      expect(statusExpired).toEqual({ status: 'expired' });

      // Nonexistent -> expired
      const statusNotFound = await service.getBindTicket('non-existent', 'acc-1');
      expect(statusNotFound).toEqual({ status: 'expired' });
    });

    it('confirmBindTicket binds wechat and marks ticket confirmed once', async () => {
      await store.create({
        id: 'ticket-3',
        status: 'pending',
        purpose: 'bind_wechat',
        ownerAccountId: 'acc-web',
        createdAt: Date.now(),
        expiresAt: Date.now() + 300_000,
      });

      mockWechat.jscode2session.mockResolvedValue({
        openid: 'wx-openid-888',
        unionid: null,
      });
      mockPrisma.userOauthBinding.findFirst.mockResolvedValue(null);
      mockPrisma.userOauthBinding.create.mockResolvedValue({});

      const confirmRes = await service.confirmBindTicket('ticket-3', 'wx-code');
      expect(confirmRes).toEqual({ status: 'confirmed', bound: true });

      const check = await service.getBindTicket('ticket-3', 'acc-web');
      expect(check).toEqual({ status: 'confirmed' });

      // Calling confirm again rejects with conflict
      await expect(service.confirmBindTicket('ticket-3', 'wx-code')).rejects.toThrow(
        '该二维码已完成绑定，请勿重复操作',
      );
    });

    it('confirmBindTicket throws conflict error if wechat is already bound to another account', async () => {
      await store.create({
        id: 'ticket-4',
        status: 'pending',
        purpose: 'bind_wechat',
        ownerAccountId: 'acc-web',
        createdAt: Date.now(),
        expiresAt: Date.now() + 300_000,
      });

      mockWechat.jscode2session.mockResolvedValue({
        openid: 'wx-openid-999',
        unionid: null,
      });
      mockPrisma.userOauthBinding.findFirst.mockResolvedValue({
        id: 'binding-1',
        accountId: 'acc-other',
      });

      await expect(service.confirmBindTicket('ticket-4', 'wx-code')).rejects.toThrow(
        '该微信已绑定其他账号',
      );

      // Ticket remains pending on error
      const check = await service.getBindTicket('ticket-4', 'acc-web');
      expect(check).toEqual({ status: 'pending' });
    });
  });
});

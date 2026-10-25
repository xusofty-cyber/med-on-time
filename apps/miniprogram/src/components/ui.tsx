/** 通用 UI 组件（Taro 版，对应 Web 端 components/ui.tsx 的视觉与语义口径）。 */
import { Component, type CSSProperties, type PropsWithChildren, type ReactNode } from 'react';
import Taro from '@tarojs/taro';
import { Input, Picker, ScrollView, Switch, Text, View } from '@tarojs/components';
import { careModeOn, currentMember, useApp } from '../lib/store';
import { themeSwitchColor } from '../lib/theme';
import { todayInTz } from '../lib/time';

class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View className='col' style={{ gap: '20rpx' }}>
          <Text className='tx-title'>页面出错了</Text>
          <Text className='tx-md' style={{ lineHeight: 1.7 }}>
            {String(this.state.error.message ?? this.state.error)}
          </Text>
          <Text className='tx-sm tx-sub' style={{ lineHeight: 1.7 }}>
            请把这一屏截图发给开发者定位，可点击下方按钮重试或返回首页。
          </Text>
          <View className='row' style={{ gap: '12rpx' }}>
            <View className='grow'>
              <Btn variant='soft' block onClick={() => this.setState({ error: null })}>
                重试
              </Btn>
            </View>
            <View className='grow'>
              <Btn
                block
                onClick={() => {
                  this.setState({ error: null });
                  Taro.switchTab({ url: '/pages/index/index' });
                }}
              >
                返回首页
              </Btn>
            </View>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

/** 页面根容器：在每个小程序 Page 真实节点上挂载 .care-on 类与页面级可复位 ErrorBoundary。 */
export function PageShell({
  style,
  children,
}: {
  style?: CSSProperties;
} & PropsWithChildren) {
  const careSettings = useApp((s) => s.careSettings);
  const careOn = careSettings ? careSettings.careMode : careModeOn();
  return (
    <View className={`pg${careOn ? ' care-on' : ''}`} style={style}>
      <PageErrorBoundary>{children}</PageErrorBoundary>
    </View>
  );
}

export function Btn({
  variant = 'primary',
  disabled,
  block,
  onClick,
  children,
}: {
  variant?: 'primary' | 'soft' | 'ghost' | 'danger' | 'success';
  disabled?: boolean;
  block?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <View
      className={`btn btn-${variant}${disabled ? ' btn-disabled' : ''}${block ? ' btn-block' : ''}`}
      hoverClass='btn-hover'
      onClick={disabled ? undefined : onClick}
    >
      <Text>{children}</Text>
    </View>
  );
}

export function Card({ title, children }: { title?: string } & PropsWithChildren) {
  return (
    <View className='card'>
      {title && <Text className='card-title'>{title}</Text>}
      {children}
    </View>
  );
}

export function Badge({
  tone = 'gray',
  icon,
  children,
}: {
  tone?: 'green' | 'amber' | 'red' | 'gray' | 'blue';
  /** 状态图标（颜色 + 图标 + 文字三重表达）：仅状态徽标传，如已服用 ✓ / 漏服 ! / 已稍后 ◷。 */
  icon?: string;
  children: ReactNode;
}) {
  return (
    <View className={`badge badge-${tone}`}>
      {icon && <Text className='badge-icon'>{icon}</Text>}
      <Text>{children}</Text>
    </View>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
} & PropsWithChildren) {
  return (
    <View className='field'>
      <Text className='field-label'>{label}</Text>
      {children}
      {hint && <Text className='field-hint'>{hint}</Text>}
    </View>
  );
}

export function TxtInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  password,
  maxlength,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'number' | 'digit' | 'idcard';
  password?: boolean;
  maxlength?: number;
  disabled?: boolean;
}) {
  return (
    <Input
      className='input'
      value={value}
      type={type}
      password={password}
      maxlength={maxlength}
      disabled={disabled}
      placeholder={placeholder}
      placeholderClass='input-ph'
      onInput={(e) => onChange(e.detail.value)}
    />
  );
}

export interface PickOption {
  value: string;
  label: string;
}

/** 下拉选择（微信原生 Picker，外观与输入框一致）。 */
export function Pick({
  options,
  value,
  onChange,
}: {
  options: PickOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const current = options[idx];
  return (
    <Picker
      mode='selector'
      range={options.map((o) => o.label)}
      value={idx}
      onChange={(e) => {
        const opt = options[Number(e.detail.value)];
        if (opt) onChange(opt.value);
      }}
    >
      <View className='input pick-row'>
        <Text className='tx-md'>{current?.label ?? ''}</Text>
        <Text className='pick-arrow'>›</Text>
      </View>
    </Picker>
  );
}

export function DatePick({
  value,
  onChange,
  placeholder = '请选择日期',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const today = todayInTz(currentMember()?.timezone ?? 'Asia/Shanghai');
  return (
    <Picker mode='date' value={value || today} onChange={(e) => onChange(e.detail.value)}>
      <View className='input pick-row'>
        <Text className={value ? 'tx-md' : 'tx-md tx-sub'}>{value || placeholder}</Text>
        <Text className='pick-arrow'>›</Text>
      </View>
    </Picker>
  );
}

export function TimePick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Picker mode='time' value={value || '08:00'} onChange={(e) => onChange(e.detail.value)}>
      <View className='input pick-row' style={{ minWidth: '180rpx' }}>
        <Text className='tx-md'>{value || '08:00'}</Text>
        <Text className='pick-arrow'>›</Text>
      </View>
    </Picker>
  );
}

export function SwitchRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const themeId = useApp((s) => s.themeId);
  return (
    <View className='row-between' style={{ padding: '10rpx 0' }}>
      <View className='col grow' style={{ gap: '4rpx', marginRight: '16rpx' }}>
        <Text className='tx-md'>{label}</Text>
        {desc && <Text className='tx-sm tx-sub'>{desc}</Text>}
      </View>
      <Switch checked={checked} color={themeSwitchColor(themeId)} onChange={(e) => onChange(e.detail.value)} />
    </View>
  );
}

/** 底部浮层（对应 Web 端 Modal 的移动形态）。 */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
} & PropsWithChildren) {
  if (!open) return null;
  return (
    <View className='sheet-mask' onClick={onClose}>
      <View className='sheet-panel' onClick={(e) => e.stopPropagation()}>
        <Text className='sheet-title'>{title}</Text>
        <ScrollView scrollY style={{ maxHeight: '68vh' }}>
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View className='empty'>
      <Text>{text}</Text>
    </View>
  );
}

export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <View className='loading'>
      <Text>{text}</Text>
    </View>
  );
}

export function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <View>
      <Text className='error-line'>{error instanceof Error ? error.message : '加载失败，请下拉刷新重试'}</Text>
    </View>
  );
}

/** 两段切换（如 密码/验证码、本周/本月）。 */
export function SegTabs({
  options,
  value,
  onChange,
}: {
  options: PickOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View className='row' style={{ gap: '12rpx' }}>
      {options.map((o) => (
        <View key={o.value} className='grow'>
          <Btn variant={value === o.value ? 'primary' : 'ghost'} block onClick={() => onChange(o.value)}>
            {o.label}
          </Btn>
        </View>
      ))}
    </View>
  );
}

export function StatCard({
  label,
  value,
  highlight,
  warn,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <View
      className='col'
      style={{
        background: highlight ? 'var(--color-background-soft)' : 'var(--color-background-page)',
        borderRadius: '16rpx',
        padding: '20rpx',
        gap: '6rpx',
      }}
    >
      <Text className='tx-sm tx-sub'>{label}</Text>
      <Text
        className='tx-h'
        style={{ color: warn ? 'var(--color-status-danger-text)' : highlight ? 'var(--color-brand-primary)' : 'var(--color-text-primary)' }}
      >
        {value}
      </Text>
    </View>
  );
}

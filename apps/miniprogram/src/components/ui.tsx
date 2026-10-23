/** 通用 UI 组件（Taro 版，对应 Web 端 components/ui.tsx 的视觉与语义口径）。 */
import type { PropsWithChildren, ReactNode } from 'react';
import { Input, Picker, ScrollView, Switch, Text, View } from '@tarojs/components';

export function Btn({
  variant = 'primary',
  disabled,
  block,
  onClick,
  children,
}: {
  variant?: 'primary' | 'soft' | 'ghost' | 'danger';
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
  children,
}: {
  tone?: 'green' | 'amber' | 'red' | 'gray' | 'blue';
  children: ReactNode;
}) {
  return (
    <View className={`badge badge-${tone}`}>
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
  const today = new Date().toISOString().slice(0, 10);
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
  return (
    <View className='row-between' style={{ padding: '10rpx 0' }}>
      <View className='col grow' style={{ gap: '4rpx', marginRight: '16rpx' }}>
        <Text className='tx-md'>{label}</Text>
        {desc && <Text className='tx-sm tx-sub'>{desc}</Text>}
      </View>
      <Switch checked={checked} color='#0B6B4F' onChange={(e) => onChange(e.detail.value)} />
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
        background: highlight ? '#e7f4ee' : '#f6f8f7',
        borderRadius: '16rpx',
        padding: '20rpx',
        gap: '6rpx',
      }}
    >
      <Text className='tx-sm tx-sub'>{label}</Text>
      <Text
        className='tx-h'
        style={{ color: warn ? '#b91c1c' : highlight ? '#0b6b4f' : '#1a1a1a' }}
      >
        {value}
      </Text>
    </View>
  );
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 医嘱绿（UI 设计规范 V1.0 定版主色），现读 CSS 变量。
        // 变量事实源：design-system/medontime/tokens.json；默认值见
        // design-system/medontime/tokens.css（:root，主题 0 归并定稿值）。
        // rgb 三元组形式用于支持 <alpha-value>（如 focus:ring-medgreen/30）。
        medgreen: {
          DEFAULT: 'rgb(var(--color-brand-primary-rgb) / <alpha-value>)',
          dark: 'rgb(var(--color-brand-primary-strong-rgb) / <alpha-value>)',
          light: 'rgb(var(--color-brand-primary-soft-rgb) / <alpha-value>)',
        },
        // 阶段 2：各页 bg/text/border/divide-* 工具色一律读 CSS 变量，使三套主题
        // 切换无残留。变量取值见 tokens.css：主题 0 为定稿值（个别沿用 Tailwind
        // 默认值以保证默认主题视觉不变），A/B 为各主题取值。以下只列出源码中
        // 实际出现的色阶；未列出的色阶仍走 Tailwind 默认值。
        // 注意：这些颜色用 var() 直写，不支持 /<alpha> 透明度修饰（源码中无此用法）。
        neutral: {
          50: 'var(--color-neutral-50)',
          100: 'var(--color-neutral-100)',
          200: 'var(--color-neutral-200)',
          300: 'var(--color-neutral-300)',
          400: 'var(--color-neutral-400)',
          500: 'var(--color-neutral-500)',
          600: 'var(--color-neutral-600)',
          700: 'var(--color-neutral-700)',
          800: 'var(--color-neutral-800)',
          900: 'var(--color-neutral-900)',
        },
        red: {
          50: 'var(--color-red-50)',
          100: 'var(--color-red-100)',
          200: 'var(--color-red-200)',
          500: 'var(--color-red-500)',
          600: 'var(--color-red-600)',
          700: 'var(--color-red-700)',
          800: 'var(--color-red-800)',
          900: 'var(--color-red-900)',
        },
        amber: {
          50: 'var(--color-amber-50)',
          100: 'var(--color-amber-100)',
          200: 'var(--color-amber-200)',
          400: 'var(--color-amber-400)',
          500: 'var(--color-amber-500)',
          700: 'var(--color-amber-700)',
          800: 'var(--color-amber-800)',
          900: 'var(--color-amber-900)',
        },
        sky: {
          100: 'var(--color-sky-100)',
          800: 'var(--color-sky-800)',
        },
      },
      fontFamily: {
        sans: ['var(--font-family-sans)'],
      },
    },
  },
  plugins: [],
};

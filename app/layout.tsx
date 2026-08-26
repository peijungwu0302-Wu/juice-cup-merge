import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title:'果汁碰碰杯｜物理融合遊戲',
  description:'滑動果汁杯，碰撞並融合成更大的夢幻果汁！',
  openGraph:{ title:'果汁碰碰杯', description:'滑動・碰撞・融合升級', images:[{url:'https://juice-cup-merge.gpt0302.chatgpt.site/og.png',width:1200,height:630,alt:'果汁碰碰杯'}] },
  twitter:{ card:'summary_large_image', title:'果汁碰碰杯', description:'滑動・碰撞・融合升級', images:['https://juice-cup-merge.gpt0302.chatgpt.site/og.png'] }
};
export const viewport: Viewport = { width:'device-width', initialScale:1, maximumScale:1, userScalable:false, themeColor:'#f5dfb9' };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-Hant"><body>{children}</body></html>}

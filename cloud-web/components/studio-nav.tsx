export default function StudioNav({ current }: { current: 'topics' | 'imitation' | 'dedao' | 'writing' | 'publish' | 'data' }) {
  return <aside className="studio-sidebar">
    <header className="site-header">
      <h1>好多鱼图文</h1>
      <span className="edition">个人版</span>
    </header>
    <nav className="page-tabs" aria-label="主要页面">
      <a href="/topics" aria-current={current === 'topics' ? 'page' : undefined}>选题</a>
      <a href="/imitation" aria-current={current === 'imitation' ? 'page' : undefined}>热文模仿</a>
      <a href="/dedao" aria-current={current === 'dedao' ? 'page' : undefined}>得到大脑</a>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" aria-current={current === 'publish' ? 'page' : undefined}>配图发布</a>
      <a href="/article-data" aria-current={current === 'data' ? 'page' : undefined}>文章数据</a>
    </nav>
  </aside>;
}

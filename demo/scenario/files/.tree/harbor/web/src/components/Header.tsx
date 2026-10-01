interface Props {
  onRefresh: () => void
}

export function Header({ onRefresh }: Props) {
  return (
    <header className="header">
      <div className="brand">
        <img src="/favicon.svg" alt="" width={24} height={24} />
        <span>Harbor</span>
      </div>
      <nav>
        <a href="#quotes">Quotes</a>
        <a href="#shipments">Shipments</a>
      </nav>
      <button className="ghost" onClick={onRefresh} title="Refresh shipments">
        Refresh
      </button>
    </header>
  )
}

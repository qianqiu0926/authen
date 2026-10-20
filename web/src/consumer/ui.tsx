import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight, ChevronRight, Search } from "lucide-react";
import { useApp } from "./store";
export const art = (name: string) => `/authen/app/${name}.png`;
export function Icon({ name, size = 46 }: { name: string; size?: number }) {
  return (
    <img
      className="cute-icon"
      src={art("icon-" + name)}
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  );
}
export function Leaf() {
  const { state, open } = useApp();
  return (
    <button
      className="leaf-pill"
      aria-label={`小叶子 ${state.social.leaves}`}
      onClick={() => open("wallet")}
    >
      <Icon name="leaf" size={25} />
      <b>{state.social.leaves}</b>
    </button>
  );
}
export function Pill({
  children,
  mint = false,
}: {
  children: ReactNode;
  mint?: boolean;
}) {
  return <span className={"tag " + (mint ? "mint" : "")}>{children}</span>;
}
export function Primary({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="primary" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
export function Empty({
  title,
  detail,
  icon = "notebook",
}: {
  title: string;
  detail: string;
  icon?: string;
}) {
  return (
    <div className="empty-shelf">
      <Icon name={icon} size={75} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search-field">
      <Search size={18} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </label>
  );
}
export function Sheet({
  title,
  children,
  footer,
  onClose,
  room = false,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  room?: boolean;
}) {
  const { setSheet } = useApp(),
    ref = useRef<HTMLDivElement>(null),
    close = onClose || (() => setSheet(null)),
    closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input,textarea,select,summary,[tabindex="0"]',
          ) || [],
        ).filter((n) => n.getClientRects().length);
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      before?.focus();
    };
  }, []);
  return (
    <div className="sheet-backdrop">
      <section
        className={"app-sheet " + (room ? "room-sheet" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="sheet-handle" />
        <header className="sheet-header">
          {room && <button onClick={close}>关闭</button>}
          <b>{title}</b>
          {footer || <button onClick={close}>完成</button>}
        </header>
        <div className="sheet-scroll">{children}</div>
      </section>
    </div>
  );
}
export function Feature({
  title,
  subtitle,
  icon,
  onClick,
  mint = false,
}: {
  title: string;
  subtitle: string;
  icon: string;
  onClick: () => void;
  mint?: boolean;
}) {
  return (
    <button className={"feature " + (mint ? "mint" : "")} onClick={onClick}>
      <div>
        <Icon name={icon} size={53} />
        <ArrowUpRight size={17} />
      </div>
      <b>{title}</b>
      <small>{subtitle}</small>
    </button>
  );
}
export function RowLink({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button className="row-link card" onClick={onClick}>
      <Icon name={icon} size={52} />
      <div>
        <b>{title}</b>
        {subtitle && <small>{subtitle}</small>}
      </div>
      <ChevronRight size={17} />
    </button>
  );
}

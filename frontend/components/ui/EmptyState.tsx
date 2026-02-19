import Link from "next/link";
import { type LucideIcon } from "lucide-react";

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export default function EmptyState({
  icon: Icon,
  heading,
  subtext,
  action,
  compact,
}: {
  icon: LucideIcon;
  heading: string;
  subtext?: string;
  action?: EmptyStateAction;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-8" : "py-20"
      }`}
    >
      <Icon className="w-16 h-16 text-warm-300 mb-4" strokeWidth={1.25} />
      <h3 className="font-heading text-xl text-warm-800 mb-2">{heading}</h3>
      {subtext && (
        <p className="text-sm text-warm-500 max-w-xs mb-6">{subtext}</p>
      )}
      {action && (
        action.href ? (
          <Link
            href={action.href}
            className="bg-sage-500 text-white font-medium text-sm px-6 py-2.5 rounded-full hover:bg-sage-600 transition-colors duration-200 shadow-sm"
          >
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            disabled={action.disabled}
            className="bg-sage-500 text-white font-medium text-sm px-6 py-2.5 rounded-full hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 shadow-sm"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}

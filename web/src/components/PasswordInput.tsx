import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

// A plain <input type="password"> with a show/hide toggle — used on Login.tsx
// and Register.tsx. Kept as a small shared component since both pages need
// the identical eye-icon-toggle behavior, not duplicated inline twice.
export function PasswordInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`${className ?? ""} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 hover:text-gray-600"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

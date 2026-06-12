import { useTranslation } from "react-i18next";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
  { code: "fr", label: "Français" },
] as const;

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold tracking-widest text-[#00E699] uppercase">
        {t("language")}
      </label>
      <Select value={i18n.language} onValueChange={(value) => void i18n.changeLanguage(value)}>
        <SelectTrigger
          className="border-[#00E699]/30 bg-[#041C15]/60 text-sm text-white"
          aria-label={t("language")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LANGUAGES.map(({ code, label }) => (
            <SelectItem key={code} value={code}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

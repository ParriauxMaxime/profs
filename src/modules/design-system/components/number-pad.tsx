import { useTranslation } from "react-i18next";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

/** Thumb-sized keypad for grading on a phone without the OS keyboard. */
export function NumberPad({
  onDigit,
  onDecimal,
  onBackspace,
  onNext,
}: {
  onDigit: (digit: string) => void;
  onDecimal: () => void;
  onBackspace: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-2">
      {DIGITS.slice(0, 9).map((digit) => (
        <button
          key={digit}
          type="button"
          className="btn py-4 text-lg"
          onClick={() => onDigit(digit)}
        >
          {digit}
        </button>
      ))}
      <button type="button" className="btn py-4 text-lg" onClick={onDecimal}>
        ,
      </button>
      <button type="button" className="btn py-4 text-lg" onClick={() => onDigit("0")}>
        0
      </button>
      <button type="button" className="btn py-4 text-lg" onClick={onBackspace}>
        ⌫
      </button>
      <button type="button" className="btn btn-primary col-span-3 py-4 text-lg" onClick={onNext}>
        {t("entry.next")}
      </button>
    </div>
  );
}

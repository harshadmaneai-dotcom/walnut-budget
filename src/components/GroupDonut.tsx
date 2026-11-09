import { formatMoney } from '../lib/format';

export interface DonutSlice {
  id: string;
  label: string;
  color: string;
  value: number;
}

interface Props {
  slices: DonutSlice[];
  currency: string;
  size?: number;
  thickness?: number;
  caption?: string;
}

/** Ring chart of spending shares, drawn with SVG strokes so it needs no chart library. */
export function GroupDonut({ slices, currency, size = 198, thickness = 26, caption = 'this month' }: Props) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg
      className="donut"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Spending split: ${slices.map((s) => `${s.label} ${formatMoney(s.value, currency)}`).join(', ')}`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--green-soft)"
        strokeWidth={thickness}
      />
      {total === 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#dfe9d5"
          strokeWidth={1}
          strokeDasharray="2 6"
        />
      )}
      {total > 0 &&
        slices
          .filter((s) => s.value > 0)
          .map((s) => {
            const length = (s.value / total) * circumference;
            const dash = Math.max(0, length - 2);
            const circle = (
              <circle
                key={s.id}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += length;
            return circle;
          })}
      <text x="50%" y="47%" textAnchor="middle" className="donut-total">
        {formatMoney(total, currency)}
      </text>
      <text x="50%" y="59%" textAnchor="middle" className="donut-caption">
        {caption}
      </text>
    </svg>
  );
}

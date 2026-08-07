/**
 * ReadOnlyField — A dt/dd pair for displaying read-only form values.
 */

interface ReadOnlyFieldProps {
  label: string;
  value: string;
}

export function ReadOnlyField({ label, value }: ReadOnlyFieldProps) {
  return (
    <div className="space-y-1">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 min-h-[2.5rem]">
        {value || <span className="text-gray-400">&mdash;</span>}
      </dd>
    </div>
  );
}

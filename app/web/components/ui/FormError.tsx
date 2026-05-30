interface FormErrorProps {
  message: string | null | undefined
}

export function FormError({ message }: FormErrorProps) {
  if (!message) return null
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
      <p className="text-sm text-red-700">{message}</p>
    </div>
  )
}

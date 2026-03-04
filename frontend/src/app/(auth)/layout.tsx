export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">🌸 어서화</h1>
          <p className="text-muted-foreground mt-2">가까운 꽃집에서 신선한 꽃을</p>
        </div>
        {children}
      </div>
    </div>
  );
}

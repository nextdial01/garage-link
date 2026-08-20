import Image from 'next/image';

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
};

export default function BrandLogo({
  className = 'h-12',
  priority = false,
}: BrandLogoProps) {
  return (
    <Image
      src="/branding/garage-link-logo.png"
      alt="GARAGE LINK"
      width={1010}
      height={396}
      priority={priority}
      sizes="(max-width: 768px) 180px, 220px"
      data-testid="garage-brand-logo"
      className={`block h-auto !w-auto max-w-full ${className}`}
    />
  );
}

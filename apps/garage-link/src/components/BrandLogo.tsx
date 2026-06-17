import Image from 'next/image';

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
};

export default function BrandLogo({
  className = 'h-12 w-44',
  priority = false,
}: BrandLogoProps) {
  return (
    <div className={`relative shrink-0 ${className}`}>
      <Image
        src="/branding/garage-link-logo.png"
        alt="GARAGE LINK"
        fill
        priority={priority}
        sizes="(max-width: 768px) 180px, 220px"
        className="object-contain"
      />
    </div>
  );
}

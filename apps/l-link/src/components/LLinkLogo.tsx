import Image from "next/image";

type LLinkLogoProps = {
  className?: string;
  priority?: boolean;
};

export function LLinkLogo({ className = "", priority = false }: LLinkLogoProps) {
  return (
    <Image
      src="/L-Link_logo_transparent.png"
      alt="L-Link"
      width={2172}
      height={724}
      priority={priority}
      className={`h-auto max-w-full object-contain ${className}`}
    />
  );
}

const LOGO_URL =
  "https://media.base44.com/images/public/6a1b93f234a8611ee1595134/9cd3c84cf_stackdappiconver3tran.png";

/** The logo mark shared by the splash and the calm recovery state. */
export default function SplashMark() {
  return <img src={LOGO_URL} alt="Stackd" className="h-16 w-auto object-contain" />;
}
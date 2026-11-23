// Configuração da nuvem (Supabase).
// Preencha com os dados do seu projeto: Supabase → Project Settings → API (ou "Connect").
//   url:     Project URL, ex: https://abcdefghijklmnop.supabase.co
//   anonKey: chave "anon public" (ou "publishable", começa com sb_publishable_)
// Essas duas informações são públicas por natureza: quem protege os dados são as
// regras do banco em supabase/schema.sql. NUNCA coloque aqui a chave "service_role"/"secret".
// Deixando vazio, o site funciona como antes (dados só no navegador).
window.CLOUD_CONFIG = {
  url: '',
  anonKey: '',
};

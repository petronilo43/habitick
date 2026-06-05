import { createClient } from '@supabase/supabase-js';

// Substitua pelas chaves REAIS que você vai pegar no painel do seu Supabase grátis
const supabaseUrl = 'https://jjkfzsjzfhlphhoxyerr.supabase.co';
const supabaseAnonKey = 'sb_publishable_gikoDcsfDydhOUBJHp4zkA_xeRiC8mj';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
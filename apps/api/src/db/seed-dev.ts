import { hashPassword } from '../auth/passwords';
import { createDb } from './database';

// Seed exclusivamente local: crea el SUPER_ADMIN inicial desde SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD.
// La contraseña nunca se versiona ni se imprime.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!url || !email || !password) {
    throw new Error('Definir DATABASE_URL, SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en .env');
  }
  if (password.length < 12) throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 12 caracteres');
  const db = createDb(url);
  try {
    const existing = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst();
    if (existing) {
      console.log('SUPER_ADMIN ya existe; sin cambios');
      return;
    }
    await db
      .insertInto('users')
      .values({
        email,
        first_name: 'Administrador',
        last_name: 'Plataforma',
        password_hash: await hashPassword(password),
        status: 'ACTIVE',
        platform_role: 'SUPER_ADMIN',
      })
      .execute();
    console.log(`SUPER_ADMIN creado: ${email}`);
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error('Fallo del seed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

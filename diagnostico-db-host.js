require('dotenv').config();
const dns = require('dns').promises;

(async () => {
  const host = String(process.env.DB_HOST || '').trim();

  if (!host) {
    console.log('DB_HOST: NAO CONFIGURADO');
    return;
  }

  console.log('DB_HOST configurado:', 'SIM');
  console.log('Formato:', /^https?:\/\//i.test(host)
    ? 'URL com protocolo (incorreto para DB_HOST)'
    : 'Nome de host');

  console.log('Parece exemplo:',
    /example|exemplo|localhost|seu-host|your-host|placeholder|host-do-banco/i.test(host)
      ? 'SIM'
      : 'NAO IDENTIFICADO');

  try {
    const enderecos = await dns.lookup(host, { all: true });
    console.log('DNS: OK');
    console.log('Quantidade de enderecos:', enderecos.length);
  } catch (e) {
    console.log('DNS: FALHOU');
    console.log('Codigo:', e.code);
  }
})();

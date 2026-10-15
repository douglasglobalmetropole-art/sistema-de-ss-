# Versão 2 — banco independente

- `/` ou `/index.html`: sistema original, banco DB_*.
- `/index2.html`: cópia visual, usando `/api2/*` e banco DB2_*.
- Configure as variáveis DB2_* no Vercel e faça redeploy.
- `DB2_SCHEMA` é o schema PostgreSQL (padrão `u45468`), **não** o nome do banco.
- A API uMov e os serviços externos continuam usando as configurações originais; valide a correspondência dos IDs antes de ações de escrita.
- As conexões não foram testadas, pois não foram fornecidas credenciais.
- O cache de leitura é separado por versão.

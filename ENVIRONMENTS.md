# Ambientes — SIPOC Builder

## Visão geral

| Ambiente | Branch | URL | Supabase |
|---|---|---|---|
| Produção | `main` | app.p-excellence.com.br | Projeto prod |
| Homologação | `dev` | sipoc-dev.vercel.app *(ver abaixo)* | Projeto staging |

---

## 1. Supabase — criar projeto de homologação

O banco de produção **nunca** deve ser usado para testes. Crie um projeto separado:

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Nome sugerido: `sipoc-homolog`
3. Após criado, copie em **Project Settings → API**:
   - `Project URL`
   - `anon public` key
4. No novo projeto, rode os mesmos scripts SQL de criação de tabelas que estão no projeto de produção
   - Acesse o projeto de prod → **SQL Editor** → copie e execute no projeto de staging

---

## 2. Variáveis de ambiente locais

Crie dois arquivos locais (ambos ignorados pelo Git):

**`.env.local`** — aponta para **produção** (uso cauteloso):
```
VITE_SUPABASE_URL=https://xeqlaezylfoavmdztmws.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key de prod>
```

**`.env.homolog.local`** — aponta para **homologação**:
```
VITE_SUPABASE_URL=https://SEU-PROJETO-HOMOLOG.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key de homolog>
```

### Rodar localmente em cada ambiente

```bash
# Desenvolvimento apontando para produção (padrão)
npm run dev

# Desenvolvimento apontando para homologação
npm run dev:homolog
```

> O Vite carrega automaticamente `.env.homolog.local` quando `--mode homolog` é passado.

---

## 3. Vercel — configurar Branch Deploy para `dev`

A Vercel suporta URLs fixas por branch. Configure assim:

1. Acesse [vercel.com/dashboard](https://vercel.com/dashboard) → projeto `p-excellence-sipoc`
2. **Settings → Git** → conecte o repositório `workflowdaniluz-coder/sipoc-builder` se ainda não estiver conectado
3. **Settings → Environment Variables** → adicione as variáveis **separadas por ambiente**:

   | Variável | Produção | Preview (branch `dev`) |
   |---|---|---|
   | `VITE_SUPABASE_URL` | URL do projeto prod | URL do projeto homolog |
   | `VITE_SUPABASE_ANON_KEY` | anon key de prod | anon key de homolog |

4. Em **Settings → Git → Branch Deploys**, garanta que `dev` está na lista de branches com deploy automático
5. Após o próximo push para `dev`, a Vercel gerará uma URL no formato:
   `https://p-excellence-sipoc-git-dev-TEAM.vercel.app`
   — você pode criar um alias fixo como `sipoc-dev.vercel.app`

### Deploy manual para homologação (sem GitHub integration)

Se preferir continuar com deploy via CLI:

```bash
# Faz deploy da branch dev para um URL de preview (não sobrescreve produção)
git checkout dev
npx vercel

# Para promover homologação a produção (após validação):
npx vercel --prod
```

---

## 4. Fluxo de desenvolvimento

```
main (produção)
  │
  └── dev (homologação)
        │
        ├── feature/monday-integration
        ├── feature/bpmn-validation
        └── fix/algum-bug
```

### Passo a passo para uma nova feature

```bash
# 1. Partir sempre da dev atualizada
git checkout dev
git pull origin dev

# 2. Criar branch da feature
git checkout -b feature/nome-da-feature

# 3. Desenvolver e testar localmente
npm run dev:homolog

# 4. Commit e push
git add .
git commit -m "feat: descrição da feature"
git push origin feature/nome-da-feature

# 5. Abrir PR: feature/nome → dev
#    Vercel gera preview automático do PR

# 6. Após aprovação, merge para dev → deploy automático em homologação
#    Testar em sipoc-dev.vercel.app

# 7. Quando validado, abrir PR: dev → main
#    Merge → deploy automático em produção (app.p-excellence.com.br)
```

---

## 5. Monday.com — integração futura

A API key do Monday **não pode ser exposta no frontend** (variável `VITE_*`).
A integração precisará de um backend intermediário. Opções:

- **Vercel Edge Functions** (`/api/monday.js`) — zero infraestrutura extra, recomendado
- **Supabase Edge Functions** — se a lógica envolver dados do banco

Variáveis a configurar na Vercel quando chegar a hora:

| Variável | Onde configurar |
|---|---|
| `MONDAY_API_KEY` | Vercel → Environment Variables (sem prefixo `VITE_`) |
| `MONDAY_BOARD_ID_PROD` | Apenas no ambiente Production |
| `MONDAY_BOARD_ID_DEV` | Apenas no ambiente Preview |

---

## 6. Resumo de arquivos

| Arquivo | Commitar? | Descrição |
|---|---|---|
| `.env.example` | ✅ sim | Template com nomes das variáveis |
| `.env.local` | ❌ não | Credenciais locais de produção |
| `.env.homolog.local` | ❌ não | Credenciais locais de homologação |
| `.env.production` | ❌ não | Sobrescrita de prod (usar Vercel UI) |
| `ENVIRONMENTS.md` | ✅ sim | Este arquivo |

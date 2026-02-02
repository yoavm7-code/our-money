# פתרון שגיאת P3009 – Migration שנכשל ב-Railway

אם ה-Backend קורס עם `P3009: migrate found failed migrations`, בצע את השלבים הבאים **פעם אחת**.

## שלב 1: התקנת Railway CLI

בטרמינל (PowerShell):

```powershell
npm install -g @railway/cli
```

## שלב 2: התחברות

```powershell
railway login
```

יפתח דפדפן – אשר את ההתחברות.

## שלב 3: חיבור לפרויקט

```powershell
cd "C:\Users\Yoav\Desktop\Our Money"
railway link
```

בחר: Team → Project → **Backend** (השירות NestJS, לא Frontend ולא Postgres).

## שלב 4: תיקון ה-Migration

```powershell
cd backend
railway run npx prisma migrate resolve --rolled-back 20260129000000_add_installment_fields
```

אם מופיעה שגיאה גם על migration נוסף:

```powershell
railway run npx prisma migrate resolve --rolled-back 20260129100000_fix_installment_amounts
```

## שלב 5: Redeploy ב-Railway

ב-Railway Dashboard → Backend → Deployments → **Redeploy**.

לאחר מכן ה-Backend אמור לעלות בהצלחה.

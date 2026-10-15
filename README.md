# הזמנות

אפליקציית ווב לניהול הזמנות: המנהל משתף מהווטסאפ, הגרפיקאי עונה באותו כרטיס, ומה שמאושר עובר לרשימה היומית של צוות השטח. מה שלא בוצע היום עולה לראש הרשימה מחר.

- **אתר:** Cloudflare Pages (חינם)
- **נתונים, קבצים, כניסה:** Supabase, שרת בפרנקפורט
- **כניסה:** קישור אישי בלי סיסמה. לכל צוות שטח קישור אחד לכל הטלפונים.

## מה יש בגרסה הראשונה

| | |
|---|---|
| שיתוף מווטסאפ (אנדרואיד) | "שתף" ← "הזמנות": הזמנה חדשה או הוספה להזמנה פתוחה |
| הזמנה ידנית | כפתור + במסך הראשי |
| כרטיס הזמנה | שיחה עם הגרפיקאי: טקסט, תמונות, קבצים, הקלטות קול |
| סטטוסים | חדשה ← בעבודה ← ממתין לאישור ← מאושר לביצוע ← בוצע, וחזרה לתיקון |
| טיוטה ללקוח | כפתור "שלח ללקוח בווטסאפ" על כל טיוטה |
| שני צוותי שטח | המנהל בוחר צוות ותאריך באישור |
| רשימת שטח יומית | "בוצע" עם תמונת סיום, "נתקעתי" עם הערה, עובד גם בלי קליטה |
| העברה למחר | עבודה שלא בוצעה מופיעה למחרת בראש הרשימה עם תגית "מאתמול" |
| דחוף, לראש הרשימה, שינוי תאריך | בכרטיס ההזמנה אצל המנהל |
| התראות בטלפון | בכל פעם שהכדור עובר, וסיכום בוקר לצוותים |
| מחיקת קבצים סופיים | אוטומטית 6 חודשים אחרי "בוצע". תמונות ושיחה נשארים |
| גיבוי | ייצוא יומי של כל הנתונים, נשמר 90 יום ב-GitHub |

## הקמה (פעם אחת, כ-30 דקות)

### 1. Supabase

1. נכנסים ל-[supabase.com](https://supabase.com) ונרשמים עם המייל של העסק.
2. **New project**: שם `orders`, אזור **Central EU (Frankfurt)**. בוחרים סיסמה למסד הנתונים ושומרים אותה במקום בטוח (תצטרכו אותה בשלב 3).
3. **Authentication ← Sign In / Providers**: מפעילים **Allow anonymous sign-ins** ושומרים. (כך עובד הקישור האישי בלי סיסמה.)
4. אוספים ארבעה פרטים, אל תשלחו אותם בצ'אט:
   - **Project ref ו-Project URL**: Project Settings ← General / Data API
   - **מפתח ציבורי** (publishable / anon): Project Settings ← API Keys
   - **מפתח סודי** (secret / service_role): Project Settings ← API Keys
   - **Access token**: תמונת הפרופיל ← Account preferences ← Access Tokens ← Generate new token

### 2. Cloudflare Pages

1. נכנסים ל-[dash.cloudflare.com](https://dash.cloudflare.com) ונרשמים.
2. **Workers & Pages ← Create ← Pages ← Connect to Git**, ובוחרים את המאגר `orders-app`.
3. הגדרות בנייה: Framework preset **None**, Build command `npm run build`, Build output directory `dist`.
4. **Environment variables**:
   - `VITE_SUPABASE_URL` = ה-Project URL
   - `VITE_SUPABASE_ANON_KEY` = המפתח הציבורי
5. **Save and Deploy**. בסוף מקבלים כתובת כמו `orders-app.pages.dev`.

### 3. GitHub Secrets

במאגר ב-GitHub: **Settings ← Secrets and variables ← Actions ← New repository secret**, חמישה סודות:

| שם | ערך |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | ה-Access token |
| `SUPABASE_PROJECT_REF` | ה-Project ref |
| `SUPABASE_DB_PASSWORD` | סיסמת מסד הנתונים |
| `SUPABASE_URL` | ה-Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | המפתח הסודי |

אחר כך: **Actions ← עדכון Supabase ← Run workflow**. זה יוצר את הטבלאות, ההרשאות ופונקציית ההתראות. מכאן והלאה זה רץ לבד בכל עדכון.

### 4. הקישור של המנהל

ב-Supabase: **SQL Editor**, מדביקים (עם הכתובת מ-Cloudflare) ולוחצים Run:

```sql
select 'https://orders-app.pages.dev/join#t=' || public.bootstrap_manager('נסים');
```

פותחים את הקישור שיוצא **בכרום בטלפון של המנהל**, ואז תפריט ⋮ ← **הוספה למסך הבית** (או "התקנת אפליקציה"). לוחצים 🔔 כדי להפעיל התראות.

> טלפון של המנהל אבד? אותו מקום: `select 'https://orders-app.pages.dev/join#t=' || public.reset_manager_link();`

### 5. גרפיקאי וצוותים

באפליקציה: **משתמשים ← הוספת משתמש**: גרפיקאי, צוות 1, צוות 2. לכל אחד יוצא קישור עם כפתור "שלח בווטסאפ". כל אחד פותח בכרום, מוסיף למסך הבית ומפעיל התראות.

### 6. בדיקה ראשונה

בווטסאפ: מסמנים הודעה ותמונה ← שתף ← **הזמנות**. אם ווטסאפ משתף רק חלק, משתפים פעם שנייה ובוחרים "הוספה להזמנה פתוחה".

## עלויות

0 ₪ בהתחלה. כשהקבצים מתקרבים ל-1 GB עוברים בתוכנית של Supabase ל-Pro (כ-25$ לחודש).

## לפיתוח

```bash
npm install
cp .env.example .env.local   # ממלאים את שני הערכים
npm run dev
```

- `supabase/migrations`: הסכמה וההרשאות. כל ההרשאות נאכפות במסד הנתונים (RLS ופונקציות).
- `supabase/functions/notify`: שליחת התראות Web Push. מפתחות VAPID נוצרים לבד בקריאה הראשונה.
- `scripts/daily.mjs`: המשימה היומית (`.github/workflows/daily.yml`).
- `test/run.sh`: בדיקת זרימה והרשאות על Postgres ריק (רצה גם ב-CI).

# הזמנות

אפליקציית ווב לניהול הזמנות: המנהל משתף מהווטסאפ, הגרפיקאי עונה באותו כרטיס, ומה שמאושר עובר לרשימה היומית של צוות השטח. מה שלא בוצע היום עולה לראש הרשימה מחר.

- **אתר:** Cloudflare Pages (חינם)
- **נתונים, קבצים, כניסה:** Supabase, שרת בפרנקפורט
- **כניסה:** קישור אישי בלי סיסמה. לכל צוות שטח קישור אחד לכל הטלפונים.

## מה יש בגרסה הראשונה

| | |
|---|---|
| הזמנות אוטומטיות מוואטסאפ | לקוחות כותבים למספר העסקי, ה-AI פותח וממלא הזמנה (ראו למטה) |
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

## הזמנות אוטומטיות מוואטסאפ (מספר עסקי נפרד)

לקוח כותב ושולח תמונות למספר העסקי ← Meta מעבירה כל הודעה ל-Supabase ← ההודעות נשמרות בכרטיס הזמנה (לקוח שכבר יש לו הזמנה פתוחה מהשבועיים האחרונים ממשיך באותו כרטיס) ← כשהלקוח מפסיק לשלוח לחצי דקה, ה-AI ממלא מה מזמינים, שם, כתובת ותאריך, וכותב סיכום ← המנהל מקבל התראה "הזמנה חדשה מוואטסאפ". הלקוח מקבל פעם אחת תשובה אוטומטית עם מספר ההזמנה.

- ה-AI ממלא פרטים רק כל עוד ההזמנה "חדשה". שדה שהמנהל שינה ידנית לא נדרס.
- המספר העסקי עובד דרך החיבור הרשמי של Meta, ולכן **לא פתוח באפליקציית וואטסאפ בטלפון**. ההודעות מופיעות באפליקציית ההזמנות.

### הקמה

**א. Anthropic (ה-AI)**
1. נכנסים ל-[console.anthropic.com](https://console.anthropic.com), נרשמים, ובחלק **Billing** טוענים 5$.
2. **API Keys ← Create Key**. שומרים את המפתח.

**ב. Meta (וואטסאפ)**
1. נכנסים ל-[developers.facebook.com](https://developers.facebook.com) עם הפייסבוק, **My Apps ← Create App**, בוחרים **Connect with customers through WhatsApp** ותיק עסקי (Business portfolio) חדש בשם העסק.
2. בתפריט **WhatsApp ← API Setup** מקבלים מספר בדיקה של Meta. מוסיפים את הטלפון הפרטי שלכם ב-**To** (עד 5 מספרים) כדי לבדוק לפני שה-SIM מוכן.
3. **App settings ← Basic**: מעתיקים את **App secret**. באותו מסך, ב-**Privacy Policy URL** מדביקים `https://orders-app-5rl.pages.dev/privacy` ושומרים.
4. טוקן קבוע: [business.facebook.com](https://business.facebook.com) ← **Settings ← Users ← System users ← Add** (Admin) ← **Assign assets**: האפליקציה (Full control) ← **Generate token**, מסמנים `whatsapp_business_messaging` ו-`whatsapp_business_management`, תוקף **Never**. שומרים את הטוקן.
5. בוחרים מילה סודית כלשהי (למשל `orders-` ועוד כמה אותיות ומספרים). זה ה-Verify token.

**ג. GitHub Secrets** (כמו בשלב 3 למעלה), ארבעה סודות חדשים:

| שם | ערך |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | המילה הסודית שבחרתם |
| `WHATSAPP_APP_SECRET` | ה-App secret |
| `WHATSAPP_TOKEN` | הטוקן הקבוע |
| `ANTHROPIC_API_KEY` | המפתח מ-Anthropic |

לא חובה: `WHATSAPP_AUTO_REPLY` לנוסח אחר של התשובה האוטומטית (`{id}` הופך למספר ההזמנה, `off` מבטל).

**מצב העברה מהמנהל** (`WHATSAPP_MANAGERS`, למשל `97246778111`, כמה מספרים מופרדים בפסיק): המספר העסקי מקבל הודעות רק מהמנהל. הלקוחות כותבים למנהל, והמנהל מעביר (Forward) רק את מה שהוא הזמנה, יחד עם איש הקשר של הלקוח (📎 ← איש קשר) כדי שהשם והטלפון יתמלאו. רצף העברות הוא הזמנה אחת; אחרי 10 דקות בלי הודעה, או איש קשר של לקוח אחר, נפתחת הזמנה חדשה. המנהל מקבל בחזרה סיכום, מה חסר וקישור להזמנה. כדי לבטל: מוחקים את הסוד גם ב-Supabase (Edge Functions ← Secrets), כי מחיקה ב-GitHub לא מוחקת אותו שם.

אחר כך: **Actions ← עדכון Supabase ← Run workflow**.

**ד. חיבור הכתובת ב-Meta**
1. **WhatsApp ← Configuration ← Webhook ← Edit**:
   - Callback URL: `https://soyfdodhkvqwrmirqhmm.supabase.co/functions/v1/whatsapp`
   - Verify token: המילה הסודית
2. **Verify and save**, ואז ב-**Webhook fields** מסמנים **messages** ← Subscribe.
3. בדיקה: שולחים מהטלפון הפרטי הודעה ותמונה למספר הבדיקה. אחרי כחצי דקה מופיעה הזמנה באפליקציה.

**ה. המספר האמיתי (SIM חדש)**
1. ה-SIM בטלפון כלשהו, רק כדי לקבל SMS או שיחה עם קוד. המספר **לא** רשום בשום אפליקציית וואטסאפ (אם כן, מוחקים שם את החשבון קודם).
2. **WhatsApp ← API Setup ← Add phone number**: שם תצוגה (שם העסק), קטגוריה, מספר, קוד אימות.
3. Meta עשויה לבקש אמצעי תשלום. תשובות ללקוח עד 24 שעות מההודעה שלו בחינם, וזה כל מה שהמערכת שולחת.
4. בראש מסך האפליקציה ב-Meta מעבירים את **App Mode** ל-**Live**. בלי זה מגיעות רק הודעות בדיקה.

## עלויות

0 ₪ בהתחלה. כשהקבצים מתקרבים ל-1 GB עוברים בתוכנית של Supabase ל-Pro (כ-25$ לחודש).

וואטסאפ: הודעות נכנסות ותשובה בתוך 24 שעות בחינם. AI: בערך 20 עד 60 אגורות להזמנה (תלוי בכמה תמונות והודעות), מתוך הקרדיט שנטען ב-Anthropic.

## לפיתוח

```bash
npm install
cp .env.example .env.local   # ממלאים את שני הערכים
npm run dev
```

- `supabase/migrations`: הסכמה וההרשאות. כל ההרשאות נאכפות במסד הנתונים (RLS ופונקציות).
- `supabase/functions/notify`: שליחת התראות Web Push. מפתחות VAPID נוצרים לבד בקריאה הראשונה.
- `supabase/functions/whatsapp`: קליטת הודעות מ-WhatsApp Cloud API ומילוי ההזמנה עם Claude.
- `scripts/daily.mjs`: המשימה היומית (`.github/workflows/daily.yml`).
- `test/run.sh`: בדיקת זרימה והרשאות על Postgres ריק (רצה גם ב-CI).

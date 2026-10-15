import { configured } from "../lib/supabase";

/** מוצג למי שפתח את האפליקציה בלי קישור אישי */
export function Welcome() {
  return (
    <div className="center-page">
      <div className="logo">הזמנות</div>
      {configured ? (
        <p>כדי להיכנס צריך קישור אישי מהמנהל. פתחו את הקישור שקיבלתם בווטסאפ.</p>
      ) : (
        <p className="error">האפליקציה עוד לא מחוברת למסד הנתונים (חסרים VITE_SUPABASE_URL ו-VITE_SUPABASE_ANON_KEY).</p>
      )}
    </div>
  );
}

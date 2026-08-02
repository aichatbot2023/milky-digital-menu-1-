/**
 * Nazivi koje kupac vidi na oznakama uživo i u profilu prostora.
 *
 * Detektor i motor preporuka iznutra rade na engleskim oznakama (to su
 * mašinske vrednosti), ali kupcu se NIKAD ne prikazuje engleski ako je
 * izabrao drugi jezik. Zato ovde stoji prevod svake vidljive reči.
 */
import { getLang } from "./i18n";

type Map3 = Record<string, string>;

/* --------------------------------------------------- predmeti (COCO) */
const OBJ: Record<string, Map3> = {
  en: {},
  sr: { couch: "kauč", chair: "stolica", bed: "krevet", "dining table": "sto", tv: "televizor", "potted plant": "biljka", vase: "vaza", clock: "sat", book: "knjiga", laptop: "laptop", refrigerator: "frižider", oven: "rerna", microwave: "mikrotalasna", sink: "sudopera", toilet: "WC šolja", toaster: "toster", keyboard: "tastatura", mouse: "miš", remote: "daljinski", cup: "šolja", bowl: "činija", bottle: "flaša", "wine glass": "čaša za vino", "teddy bear": "plišana igračka" },
  de: { couch: "Sofa", chair: "Stuhl", bed: "Bett", "dining table": "Esstisch", tv: "Fernseher", "potted plant": "Pflanze", vase: "Vase", clock: "Uhr", book: "Buch", laptop: "Laptop", refrigerator: "Kühlschrank", oven: "Backofen", microwave: "Mikrowelle", sink: "Spüle", toilet: "WC", toaster: "Toaster", keyboard: "Tastatur", mouse: "Maus", remote: "Fernbedienung", cup: "Tasse", bowl: "Schüssel", bottle: "Flasche", "wine glass": "Weinglas", "teddy bear": "Kuscheltier" },
  fr: { couch: "canapé", chair: "chaise", bed: "lit", "dining table": "table", tv: "téléviseur", "potted plant": "plante", vase: "vase", clock: "horloge", book: "livre", laptop: "ordinateur portable", refrigerator: "réfrigérateur", oven: "four", microwave: "micro-ondes", sink: "évier", toilet: "toilettes", toaster: "grille-pain", keyboard: "clavier", mouse: "souris", remote: "télécommande", cup: "tasse", bowl: "bol", bottle: "bouteille", "wine glass": "verre à vin", "teddy bear": "peluche" },
  es: { couch: "sofá", chair: "silla", bed: "cama", "dining table": "mesa", tv: "televisor", "potted plant": "planta", vase: "jarrón", clock: "reloj", book: "libro", laptop: "portátil", refrigerator: "nevera", oven: "horno", microwave: "microondas", sink: "fregadero", toilet: "inodoro", toaster: "tostadora", keyboard: "teclado", mouse: "ratón", remote: "mando", cup: "taza", bowl: "cuenco", bottle: "botella", "wine glass": "copa", "teddy bear": "peluche" },
  it: { couch: "divano", chair: "sedia", bed: "letto", "dining table": "tavolo", tv: "televisore", "potted plant": "pianta", vase: "vaso", clock: "orologio", book: "libro", laptop: "portatile", refrigerator: "frigorifero", oven: "forno", microwave: "microonde", sink: "lavello", toilet: "water", toaster: "tostapane", keyboard: "tastiera", mouse: "mouse", remote: "telecomando", cup: "tazza", bowl: "ciotola", bottle: "bottiglia", "wine glass": "calice", "teddy bear": "peluche" },
  nl: { couch: "bank", chair: "stoel", bed: "bed", "dining table": "eettafel", tv: "televisie", "potted plant": "plant", vase: "vaas", clock: "klok", book: "boek", laptop: "laptop", refrigerator: "koelkast", oven: "oven", microwave: "magnetron", sink: "gootsteen", toilet: "toilet", toaster: "broodrooster", keyboard: "toetsenbord", mouse: "muis", remote: "afstandsbediening", cup: "kop", bowl: "kom", bottle: "fles", "wine glass": "wijnglas", "teddy bear": "knuffel" },
  pt: { couch: "sofá", chair: "cadeira", bed: "cama", "dining table": "mesa", tv: "televisor", "potted plant": "planta", vase: "jarra", clock: "relógio", book: "livro", laptop: "portátil", refrigerator: "frigorífico", oven: "forno", microwave: "micro-ondas", sink: "lava-loiça", toilet: "sanita", toaster: "torradeira", keyboard: "teclado", mouse: "rato", remote: "comando", cup: "chávena", bowl: "taça", bottle: "garrafa", "wine glass": "copo de vinho", "teddy bear": "peluche" },
  pl: { couch: "sofa", chair: "krzesło", bed: "łóżko", "dining table": "stół", tv: "telewizor", "potted plant": "roślina", vase: "wazon", clock: "zegar", book: "książka", laptop: "laptop", refrigerator: "lodówka", oven: "piekarnik", microwave: "mikrofalówka", sink: "zlew", toilet: "toaleta", toaster: "toster", keyboard: "klawiatura", mouse: "mysz", remote: "pilot", cup: "kubek", bowl: "miska", bottle: "butelka", "wine glass": "kieliszek", "teddy bear": "miś" },
  sv: { couch: "soffa", chair: "stol", bed: "säng", "dining table": "matbord", tv: "tv", "potted plant": "växt", vase: "vas", clock: "klocka", book: "bok", laptop: "laptop", refrigerator: "kylskåp", oven: "ugn", microwave: "mikrovågsugn", sink: "diskho", toilet: "toalett", toaster: "brödrost", keyboard: "tangentbord", mouse: "mus", remote: "fjärrkontroll", cup: "kopp", bowl: "skål", bottle: "flaska", "wine glass": "vinglas", "teddy bear": "gosedjur" },
  tr: { couch: "kanepe", chair: "sandalye", bed: "yatak", "dining table": "masa", tv: "televizyon", "potted plant": "bitki", vase: "vazo", clock: "saat", book: "kitap", laptop: "dizüstü", refrigerator: "buzdolabı", oven: "fırın", microwave: "mikrodalga", sink: "evye", toilet: "klozet", toaster: "ekmek kızartma", keyboard: "klavye", mouse: "fare", remote: "kumanda", cup: "fincan", bowl: "kâse", bottle: "şişe", "wine glass": "kadeh", "teddy bear": "peluş" },
  ru: { couch: "диван", chair: "стул", bed: "кровать", "dining table": "стол", tv: "телевизор", "potted plant": "растение", vase: "ваза", clock: "часы", book: "книга", laptop: "ноутбук", refrigerator: "холодильник", oven: "духовка", microwave: "микроволновка", sink: "раковина", toilet: "унитаз", toaster: "тостер", keyboard: "клавиатура", mouse: "мышь", remote: "пульт", cup: "чашка", bowl: "миска", bottle: "бутылка", "wine glass": "бокал", "teddy bear": "мягкая игрушка" },
  ar: { couch: "أريكة", chair: "كرسي", bed: "سرير", "dining table": "طاولة", tv: "تلفاز", "potted plant": "نبتة", vase: "مزهرية", clock: "ساعة", book: "كتاب", laptop: "حاسوب محمول", refrigerator: "ثلاجة", oven: "فرن", microwave: "ميكروويف", sink: "حوض", toilet: "مرحاض", toaster: "محمصة", keyboard: "لوحة مفاتيح", mouse: "فأرة", remote: "جهاز تحكم", cup: "فنجان", bowl: "وعاء", bottle: "زجاجة", "wine glass": "كأس نبيذ", "teddy bear": "دمية" },
};

/* ------------------------------------------------------ tip prostorije */
const ROOM: Record<string, Map3> = {
  en: {},
  sr: { "living room": "dnevna soba", bedroom: "spavaća soba", kitchen: "kuhinja", "dining room": "trpezarija", hallway: "hodnik", office: "radna soba", bathroom: "kupatilo", nursery: "dečja soba", staircase: "stepenište", other: "prostor" },
  de: { "living room": "Wohnzimmer", bedroom: "Schlafzimmer", kitchen: "Küche", "dining room": "Esszimmer", hallway: "Flur", office: "Arbeitszimmer", bathroom: "Bad", nursery: "Kinderzimmer", staircase: "Treppenhaus", other: "Raum" },
  fr: { "living room": "salon", bedroom: "chambre", kitchen: "cuisine", "dining room": "salle à manger", hallway: "entrée", office: "bureau", bathroom: "salle de bain", nursery: "chambre d'enfant", staircase: "escalier", other: "pièce" },
  es: { "living room": "salón", bedroom: "dormitorio", kitchen: "cocina", "dining room": "comedor", hallway: "recibidor", office: "despacho", bathroom: "baño", nursery: "cuarto infantil", staircase: "escalera", other: "espacio" },
  it: { "living room": "soggiorno", bedroom: "camera da letto", kitchen: "cucina", "dining room": "sala da pranzo", hallway: "ingresso", office: "studio", bathroom: "bagno", nursery: "cameretta", staircase: "scala", other: "ambiente" },
  nl: { "living room": "woonkamer", bedroom: "slaapkamer", kitchen: "keuken", "dining room": "eetkamer", hallway: "hal", office: "werkkamer", bathroom: "badkamer", nursery: "kinderkamer", staircase: "trap", other: "ruimte" },
  pt: { "living room": "sala de estar", bedroom: "quarto", kitchen: "cozinha", "dining room": "sala de jantar", hallway: "corredor", office: "escritório", bathroom: "casa de banho", nursery: "quarto de criança", staircase: "escada", other: "espaço" },
  pl: { "living room": "salon", bedroom: "sypialnia", kitchen: "kuchnia", "dining room": "jadalnia", hallway: "przedpokój", office: "gabinet", bathroom: "łazienka", nursery: "pokój dziecięcy", staircase: "klatka schodowa", other: "wnętrze" },
  sv: { "living room": "vardagsrum", bedroom: "sovrum", kitchen: "kök", "dining room": "matsal", hallway: "hall", office: "arbetsrum", bathroom: "badrum", nursery: "barnrum", staircase: "trappa", other: "rum" },
  tr: { "living room": "oturma odası", bedroom: "yatak odası", kitchen: "mutfak", "dining room": "yemek odası", hallway: "hol", office: "çalışma odası", bathroom: "banyo", nursery: "çocuk odası", staircase: "merdiven", other: "mekân" },
  ru: { "living room": "гостиная", bedroom: "спальня", kitchen: "кухня", "dining room": "столовая", hallway: "прихожая", office: "кабинет", bathroom: "ванная", nursery: "детская", staircase: "лестница", other: "пространство" },
  ar: { "living room": "غرفة المعيشة", bedroom: "غرفة النوم", kitchen: "المطبخ", "dining room": "غرفة الطعام", hallway: "الممر", office: "المكتب", bathroom: "الحمام", nursery: "غرفة الأطفال", staircase: "الدرج", other: "المساحة" },
};

/* ------------------------------------------------------------- stilovi */
const STYLE: Record<string, Map3> = {
  en: {},
  sr: { modern: "moderan", minimal: "minimalistički", scandinavian: "skandinavski", industrial: "industrijski", "mid-century": "sredina veka", traditional: "tradicionalni", rustic: "rustični", coastal: "primorski", "art-deco": "art deko", eclectic: "eklektični", japandi: "japandi", contemporary: "savremeni" },
  de: { modern: "modern", minimal: "minimalistisch", scandinavian: "skandinavisch", industrial: "industriell", "mid-century": "Mid-Century", traditional: "klassisch", rustic: "rustikal", coastal: "maritim", "art-deco": "Art déco", eclectic: "eklektisch", japandi: "Japandi", contemporary: "zeitgenössisch" },
  fr: { modern: "moderne", minimal: "minimaliste", scandinavian: "scandinave", industrial: "industriel", "mid-century": "mid-century", traditional: "classique", rustic: "rustique", coastal: "bord de mer", "art-deco": "art déco", eclectic: "éclectique", japandi: "japandi", contemporary: "contemporain" },
  es: { modern: "moderno", minimal: "minimalista", scandinavian: "escandinavo", industrial: "industrial", "mid-century": "mid-century", traditional: "clásico", rustic: "rústico", coastal: "costero", "art-deco": "art déco", eclectic: "ecléctico", japandi: "japandi", contemporary: "contemporáneo" },
  it: { modern: "moderno", minimal: "minimalista", scandinavian: "scandinavo", industrial: "industriale", "mid-century": "mid-century", traditional: "classico", rustic: "rustico", coastal: "costiero", "art-deco": "art déco", eclectic: "eclettico", japandi: "japandi", contemporary: "contemporaneo" },
  nl: { modern: "modern", minimal: "minimalistisch", scandinavian: "Scandinavisch", industrial: "industrieel", "mid-century": "mid-century", traditional: "klassiek", rustic: "landelijk", coastal: "kust", "art-deco": "art deco", eclectic: "eclectisch", japandi: "japandi", contemporary: "hedendaags" },
  pt: { modern: "moderno", minimal: "minimalista", scandinavian: "escandinavo", industrial: "industrial", "mid-century": "mid-century", traditional: "clássico", rustic: "rústico", coastal: "costeiro", "art-deco": "art déco", eclectic: "eclético", japandi: "japandi", contemporary: "contemporâneo" },
  pl: { modern: "nowoczesny", minimal: "minimalistyczny", scandinavian: "skandynawski", industrial: "industrialny", "mid-century": "mid-century", traditional: "klasyczny", rustic: "rustykalny", coastal: "nadmorski", "art-deco": "art déco", eclectic: "eklektyczny", japandi: "japandi", contemporary: "współczesny" },
  sv: { modern: "modern", minimal: "minimalistisk", scandinavian: "skandinavisk", industrial: "industriell", "mid-century": "mid century", traditional: "klassisk", rustic: "rustik", coastal: "kust", "art-deco": "art déco", eclectic: "eklektisk", japandi: "japandi", contemporary: "samtida" },
  tr: { modern: "modern", minimal: "minimal", scandinavian: "İskandinav", industrial: "endüstriyel", "mid-century": "mid-century", traditional: "klasik", rustic: "rustik", coastal: "kıyı", "art-deco": "art deco", eclectic: "eklektik", japandi: "japandi", contemporary: "çağdaş" },
  ru: { modern: "современный", minimal: "минималистичный", scandinavian: "скандинавский", industrial: "индустриальный", "mid-century": "середина века", traditional: "классический", rustic: "рустикальный", coastal: "морской", "art-deco": "ар-деко", eclectic: "эклектичный", japandi: "джапанди", contemporary: "современный" },
  ar: { modern: "عصري", minimal: "بسيط", scandinavian: "إسكندنافي", industrial: "صناعي", "mid-century": "منتصف القرن", traditional: "كلاسيكي", rustic: "ريفي", coastal: "ساحلي", "art-deco": "آرت ديكو", eclectic: "انتقائي", japandi: "جاباندي", contemporary: "معاصر" },
};

/* ---------------------------------------------------------- osvetljenje */
const LIGHT: Record<string, Map3> = {
  en: {},
  sr: { "bright natural": "puno dnevnog svetla", "soft natural": "blago dnevno svetlo", "warm artificial": "toplo veštačko", "cool artificial": "hladno veštačko", dim: "prigušeno" },
  de: { "bright natural": "viel Tageslicht", "soft natural": "sanftes Tageslicht", "warm artificial": "warmes Kunstlicht", "cool artificial": "kühles Kunstlicht", dim: "gedämpft" },
  fr: { "bright natural": "forte lumière du jour", "soft natural": "lumière douce", "warm artificial": "lumière chaude", "cool artificial": "lumière froide", dim: "tamisée" },
  es: { "bright natural": "mucha luz natural", "soft natural": "luz natural suave", "warm artificial": "luz cálida", "cool artificial": "luz fría", dim: "tenue" },
  it: { "bright natural": "molta luce naturale", "soft natural": "luce naturale morbida", "warm artificial": "luce calda", "cool artificial": "luce fredda", dim: "soffusa" },
  nl: { "bright natural": "veel daglicht", "soft natural": "zacht daglicht", "warm artificial": "warm kunstlicht", "cool artificial": "koel kunstlicht", dim: "gedempt" },
  pt: { "bright natural": "muita luz natural", "soft natural": "luz natural suave", "warm artificial": "luz quente", "cool artificial": "luz fria", dim: "ténue" },
  pl: { "bright natural": "dużo światła dziennego", "soft natural": "łagodne światło dzienne", "warm artificial": "ciepłe światło", "cool artificial": "zimne światło", dim: "przyćmione" },
  sv: { "bright natural": "mycket dagsljus", "soft natural": "mjukt dagsljus", "warm artificial": "varmt ljus", "cool artificial": "kallt ljus", dim: "dämpat" },
  tr: { "bright natural": "bol gün ışığı", "soft natural": "yumuşak gün ışığı", "warm artificial": "sıcak ışık", "cool artificial": "soğuk ışık", dim: "loş" },
  ru: { "bright natural": "много дневного света", "soft natural": "мягкий дневной свет", "warm artificial": "тёплый свет", "cool artificial": "холодный свет", dim: "приглушённый" },
  ar: { "bright natural": "ضوء نهار وفير", "soft natural": "ضوء نهار خافت", "warm artificial": "إضاءة دافئة", "cool artificial": "إضاءة باردة", dim: "خافتة" },
};

const pick = (table: Record<string, Map3>, term: string) =>
  table[getLang()]?.[term] ?? term;

export const objectName = (cls: string) => pick(OBJ, cls);
export const roomName = (room: string) => pick(ROOM, room);
export const styleName = (style: string) => pick(STYLE, style);
export const lightName = (light: string) => pick(LIGHT, light);

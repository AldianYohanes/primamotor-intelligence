/**
 * Tambahan nama suku cadang untuk pengenal pesan stok (off-topic.ts). Dipilih tangan dari
 * korpus istilah suku cadang skripsi (kelompok "Indonesia (penggunaan bengkel)", tiap istilah
 * berjejak sumber di korpus) dan glosarium otomotif EN-ID. Hanya nama barang yang jelas;
 * kata umum atau terlalu pendek (per, klep, audio) sengaja tidak dimasukkan supaya pesan
 * biasa tidak dikira soal barang.
 */
export const EXTRA_PART_TERMS: string[] = [
  // Rem
  "kampas kopling", "silinder rem", "master rem", "kaliper", "caliper", "minyak rem", "kabel rem",
  "piston rem", "tromol", "cakram", "brake pad", "brake disc", "brake fluid", "booster rem",
  // Kaki-kaki dan kemudi
  "tie rod", "ball joint", "stabilizer", "link stabilizer", "bump stop", "per keong", "lengan suspensi",
  "arm suspensi", "bearing roda", "bearing", "as roda", "kruk as", "power steering", "rack steer",
  // Mesin dan pendingin
  "water pump", "pompa air", "pompa oli", "pompa bensin", "kipas radiator", "tutup radiator",
  "selang radiator", "tangki cadangan", "tangki air radiator", "thermostat", "termostat", "head gasket",
  "paking", "oil seal", "seal", "rantai timing", "tensioner", "fan belt", "tali kipas", "bak oli",
  "carter", "filter solar", "filter kabin", "filter oli", "filter udara", "filter bensin", "kabel busi",
  "kabel gas", "kabel kopling", "koil", "platina", "kondensor", "evaporator", "freon", "refrigeran",
  "receiver dryer", "kompresor ac",
  // Kelistrikan dan sensor
  "relay", "sekering", "fuse", "sensor oksigen", "sensor suhu", "lampu rem", "stoplamp",
  "lampu depan", "lampu belakang", "headlamp", "headlight", "taillight", "tail lamp", "lampu kabut",
  "fog lamp", "accu", "starter", "solenoid",
  // Bodi dan interior
  "mud flap", "pelindung lumpur", "karet wiper", "lengan wiper", "bilah wiper", "wiper blade",
  "kaca depan", "kaca spion", "handle pintu", "engsel pintu", "kunci pintu", "central lock",
  "power window", "airbag", "sabuk pengaman", "kisi-kisi",
  // Knalpot dan transmisi
  "muffler", "resonator", "katalis", "konverter katalitik", "kopling", "as kopling", "oli transmisi",
  "oli mesin", "oli power steering", "oli diferensial", "diferensial", "propeller shaft", "kardan",
];

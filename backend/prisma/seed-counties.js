/**
 * Seeds the 47 official counties of Kenya, per the Constitution's First
 * Schedule / IEBC county codes. This is factual public reference data, not
 * sample/demo content — run this in every environment before any county-
 * scoped record (staff, cooperative) can be created.
 *
 * Run with: node prisma/seed-counties.js
 * (Also invoked automatically by seed-pilot.js.)
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const COUNTIES = [
  ["001", "Mombasa", "Coast"],
  ["002", "Kwale", "Coast"],
  ["003", "Kilifi", "Coast"],
  ["004", "Tana River", "Coast"],
  ["005", "Lamu", "Coast"],
  ["006", "Taita-Taveta", "Coast"],
  ["007", "Garissa", "North Eastern"],
  ["008", "Wajir", "North Eastern"],
  ["009", "Mandera", "North Eastern"],
  ["010", "Marsabit", "Eastern"],
  ["011", "Isiolo", "Eastern"],
  ["012", "Meru", "Eastern"],
  ["013", "Tharaka-Nithi", "Eastern"],
  ["014", "Embu", "Eastern"],
  ["015", "Kitui", "Eastern"],
  ["016", "Machakos", "Eastern"],
  ["017", "Makueni", "Eastern"],
  ["018", "Nyandarua", "Central"],
  ["019", "Nyeri", "Central"],
  ["020", "Kirinyaga", "Central"],
  ["021", "Murang'a", "Central"],
  ["022", "Kiambu", "Central"],
  ["023", "Turkana", "Rift Valley"],
  ["024", "West Pokot", "Rift Valley"],
  ["025", "Samburu", "Rift Valley"],
  ["026", "Trans Nzoia", "Rift Valley"],
  ["027", "Uasin Gishu", "Rift Valley"],
  ["028", "Elgeyo-Marakwet", "Rift Valley"],
  ["029", "Nandi", "Rift Valley"],
  ["030", "Baringo", "Rift Valley"],
  ["031", "Laikipia", "Rift Valley"],
  ["032", "Nakuru", "Rift Valley"],
  ["033", "Narok", "Rift Valley"],
  ["034", "Kajiado", "Rift Valley"],
  ["035", "Kericho", "Rift Valley"],
  ["036", "Bomet", "Rift Valley"],
  ["037", "Kakamega", "Western"],
  ["038", "Vihiga", "Western"],
  ["039", "Bungoma", "Western"],
  ["040", "Busia", "Western"],
  ["041", "Siaya", "Nyanza"],
  ["042", "Kisumu", "Nyanza"],
  ["043", "Homa Bay", "Nyanza"],
  ["044", "Migori", "Nyanza"],
  ["045", "Kisii", "Nyanza"],
  ["046", "Nyamira", "Nyanza"],
  ["047", "Nairobi", "Nairobi"],
];

async function main() {
  for (const [code, name, region] of COUNTIES) {
    await prisma.county.upsert({
      where: { code },
      update: { name, region },
      create: { code, name, region },
    });
  }
  console.log(`Seeded ${COUNTIES.length} counties.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

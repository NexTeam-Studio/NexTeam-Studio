import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const RESEARCH_DIR = join(
  REPO_ROOT,
  "docs",
  "clients",
  "dive-factor-underwater-services",
  "02_MARKET_RESEARCH",
);

const TODAY = new Date().toISOString().slice(0, 10);
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const BLOCKED_DOMAINS = [
  "roblox.com",
  "play.google.com",
  "apps.microsoft.com",
  "apkpure.com",
  "apps.apple.com",
  "merriam-webster.com",
  "dictionary.cambridge.org",
  "wikipedia.org",
  "yelp.com",
  "pornhub.com",
  "private.com",
  "mylust.com",
  "finance.yahoo.com",
  "camp.com",
  "imdb.com",
  "netflix.com",
  "disneyplus.com",
  "rottentomatoes.com",
  "youtube.com",
  "epicgardening.com",
  "planetnatural.com",
  "gardeningsoul.com",
  "biologyinsights.com",
  "livescience.com",
  "lincare.com",
  "sciencenotes.org",
  "scied.ucar.edu",
  "aquaticbath.com",
  "atlantamom.com",
  "joincamply.com",
  "linguee.es",
  "linguee.com",
  "facebook.com",
  "instagram.com",
  "reddit.com",
  "zillow.com",
  "skylinewebcams.com",
  "hctaxcollector.com",
  "hcpao.org",
  "homedepot.com",
  "southernliving.com",
  "trimet.org",
  "lift.co.za",
  "liftapp.ai",
  "whywelift.org",
  "bds-suspension.com",
  "boattrader.com",
  "boats.com",
  "boat.com",
  "yachtworld.com",
  "boatinternational.com",
  "marinas.com",
  "cityofmarina.org",
  "dancefit.ro",
  "lakeridgeva.com",
  "lakeridgervresort.com",
  "lakeridgems.pwcs.edu",
  "usatoday.com",
  "cinemablend.com",
  "cbr.com",
  "netflixlife.com",
  "denofgeek.com",
  "slashfilm.com",
  "comingsoon.net",
  "medicalnewstoday.com",
  "mayoclinic.org",
  "my.clevelandclinic.org",
  "britannica.com",
  "oxygen.com",
  "portal.311.nyc.gov",
  "aquatica.com",
  "aquatic.com",
  "khanacademy.org",
  "learnfree.org",
  "coursera.org",
  "startpage.com",
  "search.brave.com",
  "privatevpn.com",
  "pinterest.com",
  "scribd.com",
  "studylib.net",
  "dictionary.com",
  "wordplays.com",
  "fivebelow.com",
  "gasbuddy.com",
];
const BLOCKED_TERMS = [
  "porn",
  "xxx",
  "apk",
  "download",
  "definition",
  "meaning",
  "stock price",
  "movie",
  "tv series",
  "lyrics",
  "soundtrack",
  "gardening",
  "stargazer",
  "lily",
  "bathware",
  "atomic number",
  "tv show",
  "streaming",
  "watch online",
  "water park",
  "solstice",
  "summer facts",
  "dictionary",
  "crossword",
  "meme",
  "viral",
];
const TOTAL_SHINE_DOCK_AND_HULL_PAGES = [
  "https://totalshinediving.com/HamptonDiving",
  "https://totalshinediving.com/ResidentialServices",
  "https://totalshinediving.com/HamptonPrivateDocks",
  "https://totalshinediving.com/NorfolkPrivateDocks",
  "https://totalshinediving.com/PortsmouthPrivateDocks",
  "https://totalshinediving.com/VirginiaBeachPrivateDocks",
  "https://totalshinediving.com/YorktownPrivateDocks",
  "https://totalshinediving.com/RunningGearCleaningUnderwater",
  "https://totalshinediving.com/PropellerPolishingUnderwater",
  "https://totalshinediving.com/SeaChestCleaningServices",
  "https://totalshinediving.com/SavannahHullCleaning",
];

const TOTAL_SHINE_MARINA_PAGES = [
  "https://totalshinediving.com/BayPointMarina",
  "https://totalshinediving.com/BelleIsleMarina",
  "https://totalshinediving.com/CapsMarina",
  "https://totalshinediving.com/CavalierYachtClub",
  "https://totalshinediving.com/GloucesterMarina",
  "https://totalshinediving.com/HamptonYachtClub",
  "https://totalshinediving.com/LeewardMarina",
  "https://totalshinediving.com/LittleCreekMarina",
  "https://totalshinediving.com/MarinaShores",
  "https://totalshinediving.com/MorningStarMarinas",
  "https://totalshinediving.com/OceanYachtMarina",
  "https://totalshinediving.com/PelicansNestMarina",
  "https://totalshinediving.com/SaltPondsMarina",
  "https://totalshinediving.com/ShipwrightMarina",
  "https://totalshinediving.com/SunsetMarina",
  "https://totalshinediving.com/TidewaterYachtMarina",
  "https://totalshinediving.com/WatersideMarina",
  "https://totalshinediving.com/WilloughbyMarina",
  "https://totalshinediving.com/YorkRiverYachtHaven",
];

const FLORIDA_HULL_CORE_PAGES = [
  "https://www.floridahull.com/",
  "https://www.floridahull.com/services",
  "https://www.floridahull.com/hull-cleaning",
  "https://www.floridahull.com/under-water-repairs",
  "https://www.floridahull.com/propeller-running-gear-cleaning",
  "https://www.floridahull.com/zinc-replacement",
  "https://www.floridahull.com/search-and-recovery",
  "https://www.floridahull.com/dock-and-lift-maintenance",
  "https://www.floridahull.com/hd-4k-video-inspections",
  "https://www.floridahull.com/faqs",
  "https://www.floridahull.com/pricing",
];

const FLORIDA_HULL_SERVICE_AREA_PAGES = [
  "https://www.floridahull.com/service-areas/fort-myers-hull-cleaning",
  "https://www.floridahull.com/service-areas/naples-hull-cleaning",
  "https://www.floridahull.com/service-areas/boca-grande-hull-cleaning",
  "https://www.floridahull.com/service-areas/venice-hull-cleaning",
  "https://www.floridahull.com/service-areas/casey-key-hull-cleaning",
  "https://www.floridahull.com/service-areas/sarasota-hull-cleaning",
  "https://www.floridahull.com/service-areas/cape-coral-hull-cleaning",
  "https://www.floridahull.com/service-areas/marco-island-hull-cleaning",
];

const MARINE_COMPETITOR_CORE_PAGES = [
  "https://www.watermenmarinesolutions.com/service-page/under-water-inspection",
  "https://www.riggedmarine.com/boat-dock-repair-and-maintenance",
  "https://premierdivingservices.com/",
  "https://docksidediving.com/",
  "https://www.terracon.com/service/materials/diving-services",
  "https://www.standarddivingandmarinecontracting.com/",
  "https://www.oryanmarine.com/diving.php",
  "https://midcodiving.com/underwater-inspection-services/",
  "https://captainjohnsdiveandmarineservices.com/services/",
  "https://www.subseaglobalsolutions.com/services/underwater-surveys-inspections",
  "https://workingdiver.com/underwater-inspection/",
  "https://annapolisdivingcontractors.com/",
  "https://sites.google.com/peninsuladiveservices.com/peninsuladiveservices/underwater-services",
  "https://easternmarineservices.com/",
  "https://www.iusdiving.com/",
  "https://crockermarine.com/marine-inspections/",
  "https://www.scubadubacorp.com/",
  "https://inlandboatdock.com/services/",
  "https://lozdive.com/",
  "https://www.wini.com/services/boat-lift-and-dock-inspection/",
  "https://wini.com/fortmyers/services/boat-lift-and-dock-inspection/",
  "https://www.andersondockandlift.com/dock-and-pier-inspections",
  "https://www.andersondockandlift.com/boat-lift-inspections",
  "https://satrianomarine.com/pinellas-county-dock-boat-lift-inspection.html",
  "https://theboatliftcompany.com/dock-bulkhead-and-boatlift-inspections/",
];

const LOST_ITEM_RECOVERY_PAGES = [
  "https://www.bluecorddiving.com/basic-01",
  "https://www.bluecorddiving.com/",
  "https://www.seattledivingservices.com/service-page/lost-item-recovery",
  "https://miamitechnicaldiving.com/services/search-and-recovery/",
  "https://laketravisscuba.com/recovery/",
  "https://www.floridahull.com/search-and-recovery",
  "https://www.lostring.org/",
  "https://aquaticcowboy.com/services/lake-of-the-ozarks-lost-item-recovery/",
  "https://www.brucediver.com/commercial-services/marine-lost-item-and-objects-recovery/",
  "https://www.californiarecoverydivers.com/about",
  "https://stpetescubarecovery.com/",
  "https://riversidescuba.com/underwater-recovery-services1",
  "https://www.blackpearlscuba.com/services",
  "https://www.whiteriverdivecompany.com/hiking",
  "https://theringfinders.com/David.Sheldon/",
  "https://theringfinders.com/Kyle.Tobias/",
  "https://theringfinders.com/blog/tag/scuba-diving-for-lost-ring/",
  "https://theringfinders.com/blog/tag/diver-for-hire/",
  "https://theringfinders.com/blog/tag/how-to-find-a-wallet-underwater/",
  "https://theringfinders.com/blog/tag/scuba-diver-for-hire/",
  "https://theringfinders.com/",
  "https://fr.theringfinders.com/blog/Jeff.Morgan/",
  "https://fr.theringfinders.com/blog/tag/underwater-recovery-specialist/",
  "https://lostringmaui.com/underwater-recovery-testimonials/",
  "https://srarc.com/blog/2020/10/29/ring-lost-in-the-water-recovered-by-srarc/",
];

const SCUBA_TRAINING_PAGES = [
  "https://store.padi.com/en-us/courses/open-water-diver/p/60462-1B2C/",
  "https://store.padi.com/en-us/courses/advanced-open-water/p/60463-1B2C/",
  "https://store.padi.com/en-us/ns/courses/discover-scuba-diving/p/discover-scuba-diving/",
  "https://store.padi.com/en-us/courses/",
  "https://www.padi.com/courses/open-water-diver",
  "https://www.tdisdi.com/sdi/get-certified/open-water-scuba-diver-course/",
  "https://www.naui.org/learn/entry-level/open-water-scuba-diver-autonomousiso-level-2/",
  "https://www.naui.org/learn/continuing-education/advanced-open-water-scuba-diver/",
  "https://sugarlandscuba.com/courses/padi-open-water-course",
  "https://blueplanetdc.com/courses/padi-open-water-diver",
  "https://calypsotampa.com/courses/padi-open-water-diver",
  "https://pcdivecenter.com/courses/open-water-diver-open-course",
  "https://scubanorth.com/courses/learn-to-dive",
  "https://www.diverssupplyindy.com/courses/open-water-diver",
  "https://texasscubaacademy.com/",
  "https://virginiascuba.com/",
  "https://www.diventures.com/locations/ashburn-va",
  "https://ldcscuba.com/",
  "https://aquanauticsllc.com/",
  "https://divefl.com/",
  "https://www.scubagreenville.com/",
  "https://www.southjerseyscuba.com/",
  "https://www.diveutah.com/",
  "https://carolinadivecenter.com/",
  "https://savannah.scoobashack.com/courses/open-water-diver",
  "https://www.scubaplano.com/open-water-scuba-diver-course/",
];

const REFRESHER_TRAINING_PAGES = [
  "https://store.padi.com/en-us/courses/reactivate/p/60466-1B2C/",
  "https://www.naui.org/learn/continuing-education/refresher-scuba/",
  "https://kcdiveshop.com/courses/scuba-refreshers",
  "https://www.scubagreenville.com/refresher-courses.htm",
  "https://www.scubaland.com/refresher",
  "https://descentdivers.com/courses/padi-re-activate",
  "https://louisvilledivecenter.com/courses/refresher",
  "https://seattledivetours.com/courses/reactivate-scuba-review",
  "https://www.divetripadventures.com/reactivate",
  "https://www.diversdepot.com/reactivate/",
  "https://www.magnadivers.com/all-padi-courses/padi-reactivate-scuba-refresher-course/",
  "https://www.signaturescubadiving.com/products/padi_reactivate_program_0",
  "https://y-kiki.com/courses/padi-reactivate",
  "https://www.diverightinscuba.com/reactivate-course.html",
  "https://spacecoastdivecenter.com/courses/padi-reactivate",
  "https://fintasticdiving.net/diver-training/reactivate-scuba-refresher-program/",
  "https://divefl.com/",
  "https://aquanauticsllc.com/",
  "https://www.scubagreenville.com/",
  "https://www.southjerseyscuba.com/",
  "https://www.diveutah.com/",
  "https://www.justaddwaterscuba.com/",
  "https://virginiascuba.com/",
  "https://www.diventures.com/locations/ashburn-va",
  "https://ldcscuba.com/",
];

const YOUTH_SCUBA_PAGES = [
  "https://store.padi.com/en-us/ns/courses/seal-team/p/seal-team/",
  "https://store.padi.com/en-us/ns/courses/bubblemaker/p/bubblemaker/",
  "https://store.padi.com/en-us/experience-level/youth-experience-level/",
  "https://blog.padi.com/scuba-diving-lessons-for-kids/",
  "https://blog.padi.com/scuba-camps-for-all-ages/",
  "https://blog.padi.com/how-old-do-you-have-to-be-to-scuba-dive/",
  "https://blog.padi.com/junior-open-water-vs-open-water/",
  "https://blog.padi.com/give-your-kids-a-taste-for-scuba-diving-with-the-padi-seal-team-and-bubblemaker-program/",
  "https://blog.padi.com/why-to-consider-a-scuba-holiday-with-your-kids/",
  "https://pros-blog.padi.com/engaging-youth-to-make-a-difference/",
  "https://blog.padi.com/my-padi-interview-margo-peyton-youth-diving-extraordinaire/",
  "https://sportdivers.com/courses/scuba-camp",
  "https://www.force-e.com/courses/youth-programs/",
  "https://www.adaptivescubaprograms.org/page/497025722",
  "https://ecdivers.com/ecd_class/scuba-camp-pool-classroom/",
  "https://www.gobroadreach.com/program-types/scuba-diving-summer-programs/",
  "https://catalinaseacamp.org/diving/",
  "https://www.scubaoutfittersnaples.com/junior-divers/",
  "https://ymcacollier.org/youth-scuba.html",
  "https://yssdive.com/courses/summer-scuba-camp",
  "https://www.naui.org/learn/supervised-diver/introduction-to-scuba-introductory-experienceiso-11121/",
  "https://www.naui.org/learn/recognition/young-aquatic-explorers/",
  "https://www.naui.org/learn/apnea/skin-diver/",
  "https://www.naui.org/learn/entry-level/open-water-scuba-diver-autonomousiso-level-2/",
  "https://store.padi.com/en-us/ns/courses/discover-scuba-diving/p/discover-scuba-diving/",
];

const DAN_AND_FIRST_AID_PAGES = [
  "https://dan.org/education-events/training/",
  "https://dan.org/education-events/instructor-led-courses/",
  "https://world.dan.org/education-events/instructor-led-courses/",
  "https://dan.org/alert-diver/article/emergency-oxygen/",
  "https://dan.org/research-reports/grants-collaboration/oxygen-grant-programs/",
  "https://dan.org/alert-diver/article/emergency-oxygen-cylinder-refills/",
  "https://dan.org/alert-diver/article/oxygen/",
  "https://dan.org/health-medicine/health-resources/quizzes/basic-life-support-cpr-first-aid/",
  "https://dan.org/alert-diver/article/program-spotlight-coast-guard-approves-dan-basic-life-support-cpr-and-first-aid/",
  "https://dan.org/education-events/shows-and-events/how-to-return-to-diving-safely/",
  "https://dan.org/ssi-adopts-powered-by-dan-first-aid-programs/",
  "https://dan.org/alert-diver/article/stay-current-stay-safe/",
  "https://www.naui.org/learn/first-aid/diving-first-aid/",
  "https://blueplanetdc.com/courses/dan-dfa-pro",
  "https://olympusdiving.com/courses/dan-diving-first-aid-dfa-professional-course",
  "https://redalertdiving.com/dan/diving-first-aid-for-the-diving-professional/",
  "https://pro.puravidadivers.com/dan-dfa-pro/",
  "https://www.redcross.org/take-a-class/cpr",
  "https://www.redcross.org/take-a-class/cpr/performing-cpr/cpr-steps",
  "https://www.redcross.org/take-a-class/aed/aed-training",
  "https://www.redcross.org/take-a-class/aed/aed-training/aed-certification",
  "https://www.redcross.org/take-a-class/lp/cpr-first-aid-aed-certification-new-hero",
  "https://cpr.heart.org/",
  "https://cpr.heart.org/en/resources/what-is-cpr",
  "https://store.padi.com/en-us/courses/efr/p/60475-1B2C/",
  "https://store.padi.com/en-us/courses/emergency-first-response-cpr-aed/p/60557-1B2C/",
  "https://store.padi.com/en-us/courses/emergency-first-response-care-for-children/p/70555-1B2C/",
  "https://www.padi.com/education/emergency-first-response",
];

const LIFEGUARD_AND_AQUATIC_STAFF_PAGES = [
  "https://www.redcross.org/take-a-class/lifeguarding",
  "https://www.redcross.org/take-a-class/lifeguarding/lifeguard-training",
  "https://www.redcross.org/local/new-jersey/take-a-class/lifeguarding",
  "https://www.ymcanorth.org/swimming/certifications_and_training/lifeguard_training",
  "https://www.safeswim.com/waterfront-lifeguard-certification/",
  "https://westfairswim.com/waterfront/",
  "https://theaquaticconnection.com/winnekeagma-lgt-wf/",
  "https://www.lifeguardtrainingny.com/",
  "https://www.lifeguardtrainingny.com/waterfront-lifeguard-suffolk-county.html",
  "https://jellis.com/services/lifeguard-certification",
  "https://jellis.com/classes/local-lifeguard-training",
  "https://jeffellismanagement.com/lifeguard-training",
  "https://jellis.com/services/training-and-education",
  "https://www.starguardelite.com/",
  "https://www.starfishaquatics.org/starguard.html",
  "https://www.cvprd.com/lifeguarding",
  "https://www.litchfieldpark.gov/159/Lifeguard-Training",
  "https://redwoodsgroup.com/resources/lifeguard-in-service-trainings/",
  "https://www.aquaticcouncil.com/news/12-weeks-12-in-services-lifeguards-and-aquatic-teams/",
  "https://blog.digiquatics.com/blog/running-effective-lifeguard-in-service-trainings",
  "https://www.thesilverlining.com/loss-control-resources/safety-summaries/safety-summary-161",
  "https://www.thesilverlining.com/hubfs/Safety%20Summaries%20and%20Sample%20Safety%20Policies/Lifeguard%20InService%20Training%20Technical%20Bulletin%20WB-3092%203-22.pdf",
  "https://www.lifesaving.ca/cmsUploads/lifesaving/File/Lifeguard%20Inservice%20Training%20-January%202019%281%29.pdf",
  "https://lsv.com.au/training-all/group-in-service-training/",
  "https://www.acacamps.org/sites/default/files/resource_library/07-PA-BuildingBlockstoInServiceAquaticTraining.pdf",
];

const SUPPLEMENTAL_ROWS = {
  "Underwater boat/dock services": [
    ...MARINE_COMPETITOR_CORE_PAGES,
    ...TOTAL_SHINE_DOCK_AND_HULL_PAGES,
    ...FLORIDA_HULL_CORE_PAGES,
  ],
  "Below-waterline inspections": [
    "https://www.watermenmarinesolutions.com/service-page/under-water-inspection",
    "https://www.terracon.com/service/materials/diving-services",
    "https://www.jfbrennan.com/marine-construction/underwater-inspections-and-survey",
    "https://www.standarddivingandmarinecontracting.com/",
    "https://www.oryanmarine.com/diving.php",
    "https://midcodiving.com/underwater-inspection-services/",
    "https://captainjohnsdiveandmarineservices.com/services/",
    "https://www.subseaglobalsolutions.com/services/underwater-surveys-inspections",
    "https://workingdiver.com/underwater-inspection/",
    "https://annapolisdivingcontractors.com/",
    "https://sites.google.com/peninsuladiveservices.com/peninsuladiveservices/underwater-services",
    "https://easternmarineservices.com/",
    "https://www.floridahull.com/hd-4k-video-inspections",
    "https://www.floridahull.com/propeller-running-gear-cleaning",
    "https://www.floridahull.com/under-water-repairs",
    "https://www.floridahull.com/hull-cleaning",
    "https://totalshinediving.com/RunningGearCleaningUnderwater",
    "https://totalshinediving.com/PropellerPolishingUnderwater",
    "https://totalshinediving.com/SeaChestCleaningServices",
    "https://totalshinediving.com/HamptonDiving",
    "https://www.scubadubacorp.com/",
    "https://www.iusdiving.com/",
    "https://crockermarine.com/marine-inspections/",
    "https://www.bluecorddiving.com/",
    "https://riversidescuba.com/underwater-recovery-services1",
  ],
  "Dock/lift visual inspections": [
    "https://www.wini.com/services/boat-lift-and-dock-inspection/",
    "https://wini.com/fortmyers/services/boat-lift-and-dock-inspection/",
    "https://www.andersondockandlift.com/dock-and-pier-inspections",
    "https://www.andersondockandlift.com/boat-lift-inspections",
    "https://www.andersondockandlift.com/custom-boat-docks",
    "https://www.andersondockandlift.com/boat-lifts",
    "https://www.andersondockandlift.com/custom-boat-lifts",
    "https://satrianomarine.com/pinellas-county-dock-boat-lift-inspection.html",
    "https://satrianomarine.com/pinellas-county-boat-dock.html",
    "https://satrianomarine.com/pinellas-county-boat-lift.html",
    "https://satrianomarine.com/pinellas-county-dock-boat-lift-accessories.html",
    "https://theboatliftcompany.com/dock-bulkhead-and-boatlift-inspections/",
    "https://crockermarine.com/marine-inspections/",
    "https://inlandboatdock.com/services/",
    "https://www.floridahull.com/dock-and-lift-maintenance",
    "https://www.floridahull.com/hd-4k-video-inspections",
    "https://dockexperts.com/maintenance-plans/",
    "https://www.watermenmarinesolutions.com/service-page/under-water-inspection",
    "https://www.riggedmarine.com/boat-dock-repair-and-maintenance",
    "https://totalshinediving.com/HamptonPrivateDocks",
    "https://totalshinediving.com/NorfolkPrivateDocks",
    "https://totalshinediving.com/PortsmouthPrivateDocks",
    "https://totalshinediving.com/VirginiaBeachPrivateDocks",
    "https://totalshinediving.com/YorktownPrivateDocks",
    "https://lozdive.com/",
  ],
  "Lost item recovery": LOST_ITEM_RECOVERY_PAGES,
  "Marina/boat club/fleet support": [
    ...TOTAL_SHINE_MARINA_PAGES,
    ...FLORIDA_HULL_SERVICE_AREA_PAGES,
    "https://www.scubadubacorp.com/",
    "https://easternmarineservices.com/",
    "https://www.floridahull.com/",
    "https://www.bluecorddiving.com/",
  ],
  "Scuba dive training": SCUBA_TRAINING_PAGES,
  "Private scuba lessons / refresher training": REFRESHER_TRAINING_PAGES,
  "Camp try-scuba / youth aquatic programs": YOUTH_SCUBA_PAGES,
  "DAN DFA Pro / CPR / First Aid / AED / Emergency Oxygen training": DAN_AND_FIRST_AID_PAGES,
  "Aquatic staff / lifeguard readiness training": LIFEGUARD_AND_AQUATIC_STAFF_PAGES,
};

const CATEGORY_CONFIG = [
  {
    name: "Underwater boat/dock services",
    keywords: ["underwater", "dock", "boat", "lift", "marina", "inspection", "diving"],
    queries: [
      "underwater boat dock inspection service diver marina lake",
      "dock inspection diver boat lift underwater service",
      "underwater dock boat service marina diver lake property",
      "boat dock inspection scuba diver service waterfront property",
    ],
  },
  {
    name: "Below-waterline inspections",
    keywords: ["below waterline", "hull", "underwater", "inspection", "prop", "running gear"],
    queries: [
      "\"below waterline\" inspection boat hull diver",
      "underwater hull inspection diver running gear check",
      "prop running gear visual inspection diver service",
      "boat hull underwater inspection marina diver service",
    ],
  },
  {
    name: "Dock/lift visual inspections",
    keywords: ["dock", "lift", "boat lift", "piling", "inspection", "underwater"],
    queries: [
      "dock lift underwater inspection diver service",
      "boat lift dock inspection underwater visual check",
      "dock piling underwater inspection diver lake",
      "lift cradle underwater inspection diver service",
      "\"boat lift\" inspection service diver",
      "\"dock inspection\" underwater service",
      "\"underwater dock inspection\" marina",
    ],
  },
  {
    name: "Lost item recovery",
    keywords: ["lost", "recovery", "item", "ring", "phone", "diver", "underwater"],
    queries: [
      "scuba lost item recovery lake diver service",
      "underwater item recovery diver service ring phone lake",
      "lost jewelry recovery scuba diver service",
      "lake diver lost item recovery dock marina",
    ],
  },
  {
    name: "Marina/boat club/fleet support",
    keywords: ["marina", "fleet", "club", "yacht", "rental", "boat", "underwater"],
    queries: [
      "marina underwater inspection diver service boat club fleet",
      "marina dock diver hull cleaning inspection fleet support",
      "rental fleet underwater inspection marina diver",
      "boat club marina diver service underwater support",
      "commercial marina dive services underwater inspection dock maintenance",
      "yacht club marina diver underwater service fleet",
    ],
  },
  {
    name: "Scuba dive training",
    keywords: ["scuba", "dive", "training", "certification", "course", "lessons", "instructor"],
    queries: [
      "scuba dive training certification options dive center",
      "learn scuba diving classes training instructor",
      "open water scuba lessons dive shop training",
      "scuba course training page private instruction",
      "\"open water diver\" course scuba center",
      "\"learn to dive\" scuba lessons near me",
    ],
  },
  {
    name: "Private scuba lessons / refresher training",
    keywords: ["scuba", "private", "refresher", "reactivation", "lesson", "tune up", "one on one"],
    queries: [
      "private scuba lessons refresher course instructor",
      "scuba refresher course private instructor reactivation",
      "private scuba class one on one dive training",
      "scuba reactivation refresher private lessons",
      "\"private scuba\" lessons beginner refresher",
      "\"scuba refresher\" \"private lessons\"",
      "\"one on one\" scuba lessons",
      "\"private scuba instructor\" refresher course",
      "\"discover scuba\" private lesson instructor",
      "\"scuba tune up\" private",
      "\"refresher dive\" private scuba",
      "\"scuba reactivation\" one on one",
      "\"private open water\" scuba lessons",
    ],
  },
  {
    name: "Camp try-scuba / youth aquatic programs",
    keywords: ["camp", "youth", "group", "scuba", "aquatic", "waterfront", "summer"],
    queries: [
      "camp try scuba program youth aquatic adventure",
      "youth scuba camp program group aquatic activity",
      "summer camp scuba experience pool program",
      "school camp youth group scuba experience program",
    ],
  },
  {
    name: "DAN DFA Pro / CPR / First Aid / AED / Emergency Oxygen training",
    keywords: ["dan", "cpr", "first aid", "aed", "oxygen", "emergency", "training"],
    queries: [
      "\"DAN DFA Pro\" CPR first aid AED oxygen training",
      "\"Emergency Oxygen\" training CPR AED first aid scuba",
      "\"DAN First Aid\" courses oxygen providers CPR",
      "aquatic CPR AED first aid oxygen training provider",
      "\"DAN Instructor\" first aid oxygen courses",
      "\"oxygen first aid\" diver course DAN",
      "\"CPR AED\" \"oxygen provider\" scuba course",
    ],
  },
  {
    name: "Aquatic staff / lifeguard readiness training",
    keywords: ["lifeguard", "aquatic", "waterfront", "staff", "readiness", "training", "in service"],
    queries: [
      "aquatic staff training waterfront staff readiness lifeguard in service",
      "camp waterfront staff training aquatic safety team",
      "lifeguard in service training waterfront readiness",
      "aquatic staff orientation waterfront safety training",
      "\"lifeguard in service training\" waterfront camp",
    ],
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.text();
}

function stripTags(value) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.search = "";
    let pathname = url.pathname.replace(/\/+$/, "");
    if (!pathname) pathname = "/";
    return `${url.protocol}//${url.hostname}${pathname}`;
  } catch {
    return rawUrl;
  }
}

function isRelevantResult(category, item) {
  try {
    const hostname = new URL(item.url).hostname.replace(/^www\./, "");
    if (BLOCKED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return false;
    }
  } catch {
    return false;
  }

  const haystack = `${item.title} ${item.snippet} ${item.url}`.toLowerCase();
  if (BLOCKED_TERMS.some((term) => haystack.includes(term))) {
    return false;
  }

  const keywordHits = category.keywords.filter((keyword) => haystack.includes(keyword.toLowerCase())).length;
  if (keywordHits < 1) {
    return false;
  }

  return true;
}

function parseBingRss(xml) {
  const itemPattern = /<item>([\s\S]*?)<\/item>/g;
  const items = [];
  let match;
  while ((match = itemPattern.exec(xml))) {
    const block = match[1];
    const title = stripTags((block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const url = stripTags((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || "");
    const snippet = stripTags((block.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || "");
    items.push({ url, title, snippet });
  }
  return items;
}

function pickMeta(html, pattern) {
  const match = html.match(pattern);
  return match ? stripTags(match[1]) : "";
}

function extractPageFacts(html) {
  const title = pickMeta(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    pickMeta(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    pickMeta(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i);
  const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)]
    .slice(0, 8)
    .map((match) => stripTags(match[1]));
  return { title, description, headings };
}

function inferMarket(text) {
  const knownMarkets = [
    "South Carolina",
    "North Carolina",
    "Georgia",
    "Florida",
    "Tennessee",
    "Texas",
    "California",
    "Colorado",
    "Washington",
    "Michigan",
    "Lake Hartwell",
    "Lake Keowee",
    "Lake Murray",
    "Hilton Head",
    "Savannah",
    "Charleston",
    "Greenville",
    "Orlando",
    "Tampa",
    "Dallas",
    "Austin",
    "Atlanta",
  ];

  for (const market of knownMarkets) {
    if (text.toLowerCase().includes(market.toLowerCase())) {
      return market;
    }
  }

  return "Not clearly stated";
}

function inferPageType(url, text) {
  const lower = `${url} ${text}`.toLowerCase();
  if (lower.includes("blog") || lower.includes("guide") || lower.includes("article")) return "Article / guide";
  if (lower.includes("course") || lower.includes("training")) return "Training service page";
  if (lower.includes("service") || lower.includes("inspection") || lower.includes("recovery")) return "Service page";
  if (lower.includes("program") || lower.includes("camp")) return "Program page";
  return "General landing page";
}

function detectCtaNotes(text) {
  const notes = [];
  if (/\bcall\b/i.test(text)) notes.push("Call CTA");
  if (/\bcontact\b/i.test(text)) notes.push("Contact CTA");
  if (/\bbook\b|\bschedule\b/i.test(text)) notes.push("Book/schedule CTA");
  if (/\bregister\b|\benroll\b/i.test(text)) notes.push("Register CTA");
  if (/\bquote\b|\brequest\b/i.test(text)) notes.push("Request/quote CTA");
  return notes.length ? notes.join("; ") : "Direct CTA not obvious from top page copy";
}

function detectTrustSignals(text) {
  const notes = [];
  if (/\bcertified\b|\bcertification\b/i.test(text)) notes.push("Certification language");
  if (/\bexperience\b|\bexperienced\b|\byears\b/i.test(text)) notes.push("Experience/tenure signal");
  if (/\binsured\b/i.test(text)) notes.push("Insurance claim");
  if (/\breview\b|\btestimonial\b/i.test(text)) notes.push("Social proof");
  if (/\bphoto\b|\bvideo\b|\bdocumentation\b/i.test(text)) notes.push("Documentation proof");
  if (/\bprofessional\b|\bteam\b|\binstructor\b/i.test(text)) notes.push("Team/expert framing");
  return notes.length ? notes.join("; ") : "Trust signal light or generic";
}

function detectLayoutNotes(text) {
  const notes = [];
  if (/\bfaq\b/i.test(text)) notes.push("FAQ block");
  if (/\babout\b/i.test(text)) notes.push("About section");
  if (/\bprocess\b|\bhow it works\b/i.test(text)) notes.push("Process section");
  if (/\btestimonial\b|\breview\b/i.test(text)) notes.push("Proof/testimonial section");
  if (/\bgallery\b|\bvideo\b|\bphoto\b/i.test(text)) notes.push("Visual proof");
  if (/\bcontact\b|\bbook\b|\bregister\b/i.test(text)) notes.push("Conversion block");
  return notes.length ? notes.join("; ") : "Standard service-page structure";
}

function detectPricingNotes(text) {
  if (/\$\s?\d|\bpricing\b|\brates\b|\bpackages\b/i.test(text)) {
    return "Pricing or package language appears public";
  }
  return "No public pricing surfaced in reviewed top-page content";
}

function detectComplianceNotes(text) {
  const notes = [];
  if (/\bDAN\b/i.test(text)) notes.push("DAN referenced");
  if (/\bNAUI\b/i.test(text)) notes.push("NAUI referenced");
  if (/\bPADI\b/i.test(text)) notes.push("PADI referenced");
  if (/\bCPR\b/i.test(text)) notes.push("CPR referenced");
  if (/\bAED\b/i.test(text)) notes.push("AED referenced");
  if (/\boxygen\b/i.test(text)) notes.push("Oxygen referenced");
  if (/\bsafety\b|\bstandards\b/i.test(text)) notes.push("Safety/standards language");
  return notes.length ? notes.join("; ") : "No major compliance marker in top-page content";
}

function betterNoteForCategory(category) {
  const notes = {
    "Underwater boat/dock services":
      "Use sharper before/after problem framing, stronger local-lake positioning, and cleaner visual proof than generic diver-service pages.",
    "Below-waterline inspections":
      "Explain what a visual check can and cannot do in plain English and make documentation value clearer.",
    "Dock/lift visual inspections":
      "Lead with hidden-risk visibility, owner peace of mind, and photo/video deliverables instead of vague inspection jargon.",
    "Lost item recovery":
      "Balance urgency with realistic expectations and make request conditions clearer without sounding gimmicky.",
    "Marina/boat club/fleet support":
      "Separate homeowner vs partner/bulk support and present recurring support more professionally.",
    "Scuba dive training":
      "Sound more personal and confidence-building than catalog-style dive-center pages.",
    "Private scuba lessons / refresher training":
      "Emphasize comfort, pace, and returning-diver confidence instead of generic class inventory.",
    "Camp try-scuba / youth aquatic programs":
      "Use safer, parent-friendly wording with clearer group-fit language and stronger camp/day-of logistics framing.",
    "DAN DFA Pro / CPR / First Aid / AED / Emergency Oxygen training":
      "Keep credential wording restrained while making real-world readiness benefits more concrete.",
    "Aquatic staff / lifeguard readiness training":
      "Frame this as operational readiness and drills support rather than overclaiming certification outcomes.",
  };
  return notes[category] || "Use clearer local positioning, better scannability, and a more distinctive CTA path.";
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function fallbackSourceName(url) {
  try {
    const parsed = new URL(url);
    const slug = parsed.pathname.split("/").filter(Boolean).pop();
    return slug ? slug.replace(/[-_]+/g, " ") : parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function buildResearchRow(category, item) {
  let pageTitle = item.sourceName || "";
  let description = item.description || "";
  let headings = [];

  try {
    const pageHtml = await fetchText(item.url);
    const facts = extractPageFacts(pageHtml);
    pageTitle = facts.title || pageTitle;
    description = facts.description || description;
    headings = facts.headings;
    await sleep(200);
  } catch {
    // Keep fallback values when page fetch is blocked.
  }

  const combinedText = [pageTitle, description, ...headings].filter(Boolean).join(" | ");

  return {
    category: category.name,
    sourceName: pageTitle || item.sourceName || fallbackSourceName(item.url),
    url: item.url,
    market: inferMarket(combinedText),
    pageType: inferPageType(item.url, combinedText),
    wordingNotes: (description || combinedText || "Top-page wording unavailable")
      .replace(/\s+/g, " ")
      .trim(),
    ctaNotes: detectCtaNotes(combinedText),
    trustSignalNotes: detectTrustSignals(combinedText),
    layoutNotes: detectLayoutNotes(combinedText),
    pricingNotes: detectPricingNotes(combinedText),
    complianceNotes: detectComplianceNotes(combinedText),
    betterNotes: betterNoteForCategory(category.name),
    dateReviewed: TODAY,
  };
}

async function collectCategory(category) {
  const results = new Map();
  const supplemental = (SUPPLEMENTAL_ROWS[category.name] || []).map((entry) =>
    typeof entry === "string" ? { url: normalizeUrl(entry) } : { ...entry, url: normalizeUrl(entry.url) },
  );

  if (supplemental.length < 25) {
    for (const query of category.queries) {
      const xml = await fetchText(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`);
      const parsed = parseBingRss(xml);

      for (const item of parsed) {
        const normalized = normalizeUrl(item.url);
        if (!/^https?:\/\//i.test(normalized)) continue;
        if (!isRelevantResult(category, { ...item, url: normalized })) continue;
        const keywordHits = category.keywords.filter((keyword) =>
          `${item.title} ${item.snippet} ${normalized}`.toLowerCase().includes(keyword.toLowerCase()),
        ).length;
        if (!results.has(normalized)) {
          results.set(normalized, { ...item, url: normalized, query, keywordHits });
        }
        if (results.size >= 25) break;
      }

      if (results.size >= 25) break;
      await sleep(500);
    }
  }

  const rows = [];
  const seen = new Set();

  for (const entry of supplemental) {
    if (rows.length >= 25) break;
    if (!entry.url || seen.has(entry.url)) continue;
    rows.push(await buildResearchRow(category, entry));
    seen.add(entry.url);
  }

  const rankedResults = [...results.values()]
    .sort((a, b) => (b.keywordHits || 0) - (a.keywordHits || 0))
    .slice(0, 25);

  for (const item of rankedResults) {
    if (rows.length >= 25) break;
    if (seen.has(item.url)) continue;
    rows.push(
      await buildResearchRow(category, {
        url: item.url,
        sourceName: item.title,
        description: item.snippet,
      }),
    );
    seen.add(item.url);
  }

  return rows;
}

function buildVocabularyNotes(rowsByCategory) {
  const lines = [
    "# Website Copy Vocabulary And Positioning Notes",
    "",
    `Compiled on ${TODAY} from the service-page competitive research source log.`,
    "",
    "## Global Patterns",
    "",
    "- Strong pages open with the hidden problem first, then the service.",
    "- Most training pages lean on certification jargon; Dive Factor should sound more human and less catalog-like.",
    "- High-conversion pages repeat one clear CTA path instead of burying readers in too many equal-weight buttons.",
    "- Visual proof, process clarity, and audience fit show up more often than technical detail on stronger service pages.",
    "- Boutique opportunity: combine lake-property utility, training confidence, and safety readiness under one cleaner brand system.",
    "",
  ];

  for (const [category, rows] of rowsByCategory.entries()) {
    const vocab = new Set();
    const ctas = new Set();
    const trust = new Set();

    for (const row of rows) {
      row.wordingNotes
        .toLowerCase()
        .match(/\b[a-z][a-z\-]{4,}\b/g)?.forEach((word) => {
          if (!["their", "there", "about", "under", "which", "these", "those", "training", "service", "services", "guide", "learn", "water", "diving", "scuba", "page"].includes(word)) {
            vocab.add(word);
          }
        });
      row.ctaNotes.split("; ").forEach((note) => ctas.add(note));
      row.trustSignalNotes.split("; ").forEach((note) => trust.add(note));
    }

    lines.push(`## ${category}`);
    lines.push("");
    lines.push(`- Sources reviewed: ${rows.length}`);
    lines.push(`- Repeated CTA patterns: ${[...ctas].filter(Boolean).slice(0, 5).join(", ") || "Mixed CTAs"}`);
    lines.push(`- Repeated trust signals: ${[...trust].filter(Boolean).slice(0, 5).join(", ") || "General expertise framing"}`);
    lines.push(`- Useful vocabulary cues: ${[...vocab].slice(0, 14).join(", ") || "Noisy mix of general service vocabulary"}`);
    lines.push(`- Dive Factor angle: ${betterNoteForCategory(category)}`);
    lines.push("");
  }

  return lines.join("\n");
}

function buildResearchIndex(rowsByCategory) {
  const lines = [
    "# Website Competitive Research Index",
    "",
    `Updated ${TODAY}. This index tracks the redesign research used to reposition DiveFactor.com as a more boutique, high-readability static site.`,
    "",
    "## Scope",
    "",
    "- Required minimum: 25 public pages reviewed per service/page category.",
    "- Research method: curated competitor/service pages, official course/provider pages, and Bing RSS backfill with direct page-title/meta/top-heading review.",
    "- Output files:",
    `  - \`02_MARKET_RESEARCH/SERVICE_PAGE_RESEARCH_SOURCE_LOG.csv\``,
    `  - \`02_MARKET_RESEARCH/WEBSITE_COPY_VOCABULARY_AND_POSITIONING_NOTES.md\``,
    "",
    "## Categories Reviewed",
    "",
  ];

  for (const [category, rows] of rowsByCategory.entries()) {
    lines.push(`### ${category}`);
    lines.push("");
    lines.push(`- Sources logged: ${rows.length}`);
    lines.push(`- Example sources:`);
    for (const row of rows.slice(0, 5)) {
      lines.push(`  - ${row.sourceName} - ${row.url}`);
    }
    lines.push("");
  }

  lines.push("## Core Copy Takeaways");
  lines.push("");
  lines.push("- Underwater-service pages win when they explain hidden problems, visible deliverables, and response expectations quickly.");
  lines.push("- Dive-training pages often sound generic; Dive Factor should be calmer, more personal, and clearer about who each path fits.");
  lines.push("- Camp/group pages perform best when logistics, safety posture, and audience fit are visible without turning into policy manuals.");
  lines.push("- Safety-training pages lean on credential acronyms; Dive Factor should translate those into practical readiness benefits.");
  lines.push("- Resource pages should feel editorial, not filler: stronger visuals, table of contents, clear read-time cues, and related links matter.");
  lines.push("");

  return lines.join("\n");
}

async function main() {
  mkdirSync(RESEARCH_DIR, { recursive: true });

  const allRows = [];
  const rowsByCategory = new Map();

  for (const category of CATEGORY_CONFIG) {
    const rows = await collectCategory(category);
    rowsByCategory.set(category.name, rows);
    allRows.push(...rows);
  }

  const header = [
    "Service/Page Category",
    "Competitor or Source Name",
    "URL",
    "Market/Location",
    "Page Type",
    "Wording/Vocabulary Notes",
    "CTA Notes",
    "Trust Signal Notes",
    "Layout/UX Notes",
    "Pricing/Offer Notes if public",
    "Compliance/Safety Notes",
    "What Dive Factor Can Do Better",
    "Date Reviewed",
  ];

  const csv = [
    header.map(csvEscape).join(","),
    ...allRows.map((row) =>
      [
        row.category,
        row.sourceName,
        row.url,
        row.market,
        row.pageType,
        row.wordingNotes,
        row.ctaNotes,
        row.trustSignalNotes,
        row.layoutNotes,
        row.pricingNotes,
        row.complianceNotes,
        row.betterNotes,
        row.dateReviewed,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ].join("\n");

  writeFileSync(join(RESEARCH_DIR, "SERVICE_PAGE_RESEARCH_SOURCE_LOG.csv"), csv);
  writeFileSync(
    join(RESEARCH_DIR, "WEBSITE_COPY_VOCABULARY_AND_POSITIONING_NOTES.md"),
    buildVocabularyNotes(rowsByCategory),
  );
  writeFileSync(join(RESEARCH_DIR, "WEBSITE_COMPETITIVE_RESEARCH_INDEX.md"), buildResearchIndex(rowsByCategory));

  console.log(`research rows written: ${allRows.length}`);
  for (const [category, rows] of rowsByCategory.entries()) {
    console.log(`${category}: ${rows.length}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

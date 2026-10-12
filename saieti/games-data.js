// ============================================================
// GAMES DATA
// Structure of each game:
// {
//   title: "English name / Русское название",
//   people: "4 – 12",
//   duration: "15 – 30 min.",
//   materials: "papīrs, marķieri",
//   desc_lv: "Latviešu apraksts",
//   desc_ru: "Русское описание",
//   images: ["images/example.jpg"]   // optional — one path, or an array of paths/URLs
// }
// Images: put files in saieti/images/ and reference as "images/filename.jpg"
//         or use a full URL (https://...). Paths are relative to the saieti pages.
// To add a game: push an object into the corresponding array.
// To delete: remove the object from the array.
// ============================================================
const GAMES = {
  icebreakers: [
    {
      "title": "Personal Crest (Me-Chart) / Персональный герб",
      "people": "4 – 12",
      "duration": "15 – 30 min.",
      "materials": "papīrs, marķieri",
      "desc_lv": "Dalībnieki zīmē personīgo ģerboni (vairogu), kurā ar zīmējumu palīdzību pauž svarīgus aspektus par sevi (piem., svarīgākais notikums dzīvē, galvenais mērķis nākamajam gadam, kā tu reaģē, kad esi satraukts, kas tevi dara laimīgu).",
      "desc_ru": "Участники рисуют личный герб (щит), в котором выражают важные аспекты о себе через рисунки (например, самое важное событие в жизни, главная цель на следующий год, как вы реагируете, когда расстроены, что делает вас счастливым)."
    },
    {
      "title": "Intimate Interviews / Интимные интервью",
      "people": "2 – 10",
      "duration": "15 min.",
      "materials": "nav",
      "desc_lv": "Dalībnieki sadalās pa pāriem un intervē viens otru 5 minūtes katrs. Pēc tam viņi iepazīstina savu partneri ar grupu. Svarīgi: iepazīt kādu nenozīmē atkārtot CV – nesakiet to, ko viņš/viņa darīja, bet gan to, kas viņš/viņa ir.",
      "desc_ru": "Участники разбиваются на пары и интервьюируют друг друга в течение 5 минут каждый. Затем они представляют своего партнера группе. Важно: узнать кого-то не значит повторять резюме — не говорите то, что он(а) делал(а), а говорите то, кто он(а) есть."
    },
    {
      "title": "Three Questions Game / Игра с тремя вопросами",
      "people": "Visi grupas dalībnieki",
      "duration": "10 – 15 min.",
      "materials": "Papīrs un rakstāmpiederumi",
      "desc_lv": "Visi grupā pieraksta 3 provocējošus jautājumus, ko vēlētos uzdot citiem grupas dalībniekiem (nevis parastos \"kā tevi sauc\" jautājumus, bet gan kaut ko līdzīgu \"Kur ir visinteresantākā vieta, kur esi ceļojis?\" vai \"Nosauc tēmu, par kuru jūti absolūtu kaislību\"). Dodiet laiku sapulcēties un uzdot trīs dažādiem grupas cilvēkiem vienu no saviem trim jautājumiem. Sanāciet kopā un katram cilvēkam lieciet piecelties un pateikt savu vārdu. Kad viņi pasaka savu vārdu, lūdziet grupai pastāstīt, ko viņi zina par šo personu.",
      "desc_ru": "Все в группе записывают 3 провокационных вопроса, которые они хотели бы задать другим участникам группы (не обычные вопросы в стиле «как тебя зовут», а что-то вроде «Какое самое интересное место, где вы когда-либо путешествовали?» или «Назовите тему, к которой вы испытываете абсолютную страсть»). Дайте им время пообщаться и задать трем разным людям в группе один из своих трех вопросов. Соберитесь вместе и попросите каждого человека встать и назвать свое имя. Когда они называют свое имя, попросите группу рассказать, что они знают об этом человеке."
    },
    {
      "title": "The Pocket/Purse Game / Игра в карман/сумочку",
      "people": "Visi grupas dalībnieki",
      "duration": "5 – 10 min.",
      "materials": "Priekšmeti no kabatām vai somiņām",
      "desc_lv": "Katrs dalībnieks izvēlas vienu (pēc izvēles divus) priekšmetus no savas kabatas vai somiņas, kam ir personīga nozīme. Viņi iepazīstina ar sevi, demonstrē izvēlēto priekšmetu un pastāsta, kāpēc tas viņiem ir svarīgs.",
      "desc_ru": "Каждый участник выбирает один (опционально два) предмета из своего кармана или сумочки, имеющие для них личное значение. Они представляют себя, показывают выбранный предмет и объясняют, почему он для них важен."
    },
    {
      "title": "The Talent Show / Шоу талантов",
      "people": "Visi grupas dalībnieki",
      "duration": "10 – 15 min.",
      "materials": "Nav / pēc izvēles",
      "desc_lv": "Katrs dalībnieks izvēlas vienu talantu vai īpašu dāvanu, kas viņam piemīt un ko viņš var demonstrēt grupai. Viņi iepazīstina ar sevi, izskaidro, kas ir viņu īpašais talants, un pēc tam demonstrē to grupai.",
      "desc_ru": "Каждый участник выбирает один талант или особый дар, которым он обладает и который может продемонстрировать группе. Они представляют себя, объясняют, в чем заключается их особый талант, а затем исполняют его для группы."
    },
    {
      "title": "Toilet Paper Game / Игра с туалетной бумагой",
      "people": "Visi grupas dalībnieki",
      "duration": "5 – 10 min.",
      "materials": "Tualetes papīra rullis",
      "desc_lv": "Palaidiet pa apli tualetes papīra rulli un lūdziet dalībniekiem paņemt tik daudz, cik viņiem nepieciešams, bez papildu paskaidrojumiem. Kad tas paveikts, paziņojiet grupai, ka, ejot pa telpu, katram cilvēkam ir jāpastāsta viens fakts vai kaut kas par sevi par katru paņemto tualetes papīra kvadrātu.",
      "desc_ru": "Пустите по кругу рулон туалетной бумаги и попросите участников взять столько, сколько им нужно, без дополнительных объяснений. Когда все закончат, скажите группе, что, обходя комнату, каждый человек должен рассказать один факт или что-то о себе за каждый взятый квадратик туалетной бумаги."
    },
    {
      "title": "Map Game / Карта мира",
      "people": "Visi grupas dalībnieki",
      "duration": "Ierašanās laikā",
      "materials": "Liela pasaules karte, spraudītes",
      "desc_lv": "Piekariet lielu pasaules karti. Iedodiet katram spraudīti. Ienākot telpā, viņi atzīmē savas dzimšanas vietu kartē.",
      "desc_ru": "Повесьте большую карту мира. Дайте каждому по канцелярской кнопке. При входе они прикалывают на карту место своего рождения."
    },
    {
      "title": "Paper Airplane Game / Игра с бумажными самолетиками",
      "people": "Visi grupas dalībnieki",
      "duration": "5 – 10 min.",
      "materials": "Papīra lapas",
      "desc_lv": "Katrs izgatavo papīra lidmašīnu un uzraksta uz tās savu vārdu, kaut ko kas viņam patīk un nepatīk (varat pievienot arī papildu jautājumus). Pēc norādes visi met savas lidmašīnas pa telpu. Ja atrodat lidmašīnu, paceliet to un turpiniet lidināt 1-2 minūtes. Līdz tam laikam beigām katram ir jābūt vienai papīra lidmašīnai, un šī cilvēka īpašnieks ir jāatrod un jāiepazīstina ar grupu.",
      "desc_ru": "Каждый делает бумажный самолетик и пишет на нем свое имя, что-то, что ему нравится и не нравится (можно добавить и другие вопросы). По команде все бросают свои самолетики по комнате. Если вы найдете самолетик, поднимите его и продолжайте бросать в течение 1-2 минут. К концу этого времени у каждого должен быть один бумажный самолетик. Это человек, которого они должны найти и представить группе."
    },
    {
      "title": "The Shoe Game / Игра с обувью",
      "people": "Visi grupas dalībnieki",
      "duration": "10 min.",
      "materials": "Apavi",
      "desc_lv": "Ienākot telpā, katram jānovelk viena kurpe un jāatstāj tā kaudzē pie durvīm, otru kurpi paturot kājā. Kad visi ir iekšā, vadītājs izdala kurpes cilvēkiem, kuriem nav tāda pati kurpe. Pēc norādījuma visiem jāatrod cilvēks, kuram pieder kurpe, jāiegūst informācija par viņu un jāiepazīstina savs jaunais draugs ar grupu.",
      "desc_ru": "При входе каждый должен снять одну туфлю и оставить ее в куче у двери, оставив другую на ноге. После того как все зайдут, ведущий раздает обувь людям, у которых нет такой же обуви. По команде каждый должен найти человека, которому принадлежит туфля, получить о нем информацию и представить своего нового друга группе."
    },
    {
      "title": "The Artist Game / Игра художника",
      "people": "Visi grupas dalībnieki",
      "duration": "5 – 10 min.",
      "materials": "Papīrs un zīmuļi",
      "desc_lv": "Iedodiet katram papīra lapu un zīmuli. 5 minūšu laikā viņiem jāuzzīmē zīmējums, kas pauž to, kas viņi ir, nerakstot nekādus vārdus vai ciparus. Pēc 5 minūtēm vadītājs savāc zīmējumus un rāda tos grupai pa vienam, ļaujot uzminēt, kurš to uzzīmējis. Pēc tam katrs mākslinieks iepazīstina ar sevi un paskaidro, kā viņa darbs skaidri pauž to, kas viņš ir.",
      "desc_ru": "Дайте каждому лист бумаги и карандаш. За 5 минут они должны нарисовать картинку, отражающую то, кто они есть, не используя слова и цифры. Через 5 минут ведущий собирает рисунки, показывает их группе по одному и предлагает угадать, кто автор. Затем каждый художник представляет себя и объясняет, как его работа отражает его личность."
    },
    {
      "title": "Three in Common Game / Три общего",
      "people": "Grupas pa 3 cilvēkiem",
      "duration": "10 – 15 min.",
      "materials": "Nav",
      "desc_lv": "Sadaliet grupu trijniekos. Viņu uzdevums ir atrast 3 lietas, kas viņiem ir kopīgas – nevis parastas lietas, piemēram, vecums, dzimums vai matu krāsa, bet gan trīs neparastas lietas. Ļāvuši grupām sarunāties 10-15 minūtes, viņiem (kā grupai) ir jāpastāsta pārējām grupām trīs lietas, kas viņiem ir kopīgas.",
      "desc_ru": "Разделите группу на тройки. Их задача — найти 3 вещи, которые у них есть общего. Но не обычные вещи, такие как возраст, пол или цвет волос, а три необычные вещи. Дав группам пообщаться 10-15 минут, они (как группа) должны рассказать остальным группам о трех вещах, которые у них общие."
    },
    {
      "title": "Polaroid Game / Игра с поляроидом",
      "people": "Visi grupas dalībnieki",
      "duration": "15 min.",
      "materials": "Polaroid tipa kamera un fotogrāfijas",
      "desc_lv": "Dalībniekiem ierodoties, nofotografējiet viņus ar Polaroid tipa kameru. Izsniedziet fotogrāfijas grupā tā, lai katrs dalībnieks saņemtu cita grupas dalībnieka fotoattēlu. Dodiet viņiem 15 minūtes, lai atrastu un aprunātos ar cilvēkiem, kas atbilst viņu fotoattēlam. Kad grupa sanāk kopā, katrs dalībnieks iepazīstina savu jauno fotogrāfijas draugu ar grupu un pastāsta, ko viņš par viņu uzzinājis.",
      "desc_ru": "По прибытии участников сфотографируйте их на камеру типа Polaroid. Раздайте фотографии группе так, чтобы каждый участник получил фотографию другого члена группы. Дайте им 15 минут на поиски и общение с людьми, соответствующими их фотографии. Когда группа соберется снова, попросите каждого участника представить своего нового фото-друга группе и рассказать о том, что они о нем узнали."
    },
    {
      "title": "Favorite T-Shirt Game / Любимая футболка",
      "people": "Visi grupas dalībnieki",
      "duration": "5 – 10 min.",
      "materials": "Dalībnieku mīļākie T-krekli",
      "desc_lv": "Lūdziet apmeklētājiem atnest (nevis vilkt mugurā) savu mīļāko T-kreklu uz sanāksmi. Kad visi dalībnieki ir ieradušies, lūdziet katram parādīt kreklu grupai un paskaidrot, kā tas vislabāk raksturo viņa personību.",
      "desc_ru": "Попросите участников принести (не надевать) свою любимую футболку на встречу. Когда все соберутся, попросите каждого показать футболку группе и объяснить, как она лучше всего отражает их характер."
    },
    {
      "title": "Famous People/Cities Game / Знаменитые люди и города",
      "people": "Visi grupas dalībnieki",
      "duration": "10 – 15 min.",
      "materials": "3x5 collu kartītes un līmlente",
      "desc_lv": "Katram dalībniekam ierodoties, pielīmējiet uz viņu muguras 3x5 collu kartīti ar slavenas personas vai pilsētas vārdu. Viņiem ir jāstaigā pa telpu un jāuzdod jautājumi, uz kuriem var atbildēt TIKAI ar \"JĀ\" vai \"NĒ\", lai iegūtu pavedienus un noskaidrotu vārdu uz savas kartītes. PIEMĒRI: Parīze, Madonna, Salavecis, Džons Veins, Kasablanka.",
      "desc_ru": "По прибытии каждого участника прикрепите скотчем карточку размером 3х5 дюймов с именем знаменитого человека или города к его спине. Они должны ходить по комнате и задавать вопросы, на которые можно ответить ТОЛЬКО «ДА» или «НЕТ», чтобы получить подсказки и узнать имя на карточке. ПРИМЕРЫ: Париж, Мадонна, Санта-Клаус, Джон Уэйн, Касабланка."
    },
    {
      "title": "Favorite Animal Game / Любимое животное",
      "people": "Visi grupas dalībnieki",
      "duration": "5 – 10 min.",
      "materials": "Vārdu kartītes un pildspalvas",
      "desc_lv": "Viesiem ierodoties un pirms vārda uzrakstīšanas uz vārda kartītes, lūdziet viņiem nosaukt savu mīļāko dzīvnieku un trīs īpašības vārdus, kas raksturo šo dzīvnieku. Pierakstiet šos trīs īpašības vārdus uz vārda birkas PIRMS viņu vārda (neiekļaujot dzīvnieka nosaukumu). Lūdziet viņiem sajaukties ar pūli, daloties ar to, kāpēc šie īpašības vārdi vislabāk raksturo viņu pašu personību. PIEMĒRI: Uzticīgs, mīlīgs, rotaļīgs Dans.",
      "desc_ru": "По прибытии гостей и до того, как написать их имена на бейдже, попросите их назвать свое любимое животное и три прилагательных для его описания. Запишите эти три прилагательных на бейдже ПЕРЕД их именем (опустив название животного). Попросите их пообщаться с толпой, рассказывая, почему именно эти прилагательные лучше всего характеризуют их собственную личность. ПРИМЕРЫ: Преданный, милый, игривый Дэн."
    },
    {
      "title": "Circle of Friends Game / Круг друзей",
      "people": "Liela grupa",
      "duration": "5 – 10 min.",
      "materials": "Nav",
      "desc_lv": "Šī ir lieliska sveiciena un atvadīšanās spēle lielai grupai, kas apmeklē semināru vairākas dienas un kuras iespēja satikt visus telpā ir gandrīz neiespējama. Izveidojiet divus lielus apļus (vai vienkārši izveidojiet divas rindas blakus), vienu iekšpusē un otru ārpusē, un lieciet iekšējā apļa cilvēkiem stāties pretī ārējā apļa cilvēkiem. Lūdziet apļiem paspert vienu soli pretējos virzienos, ļaujot satikt katru jaunu cilvēku, aplim turpinot kustēties ļoti lēnām. Ja tiek veidotas rindas, tās vienkārši nodrošina lēnu rindas virzību, iepazīstinot ar sevi.",
      "desc_ru": "Это отличное приветствие и прощание для большой группы, которая будет посещать семинар в течение нескольких дней вместе, и шансы встретить каждого в комнате практически невозможны. Сформируйте два больших круга (или просто две линии бок о бок), один внутри другого, и сделайте так, чтобы люди во внутреннем круге были лицом к людям во внешнем. Попросите круги сделать один шаг в противоположных направлениях, позволяя знакомиться с каждым новым человеком по мере того, как круг продолжает двигаться очень медленно. Если формируются линии, они просто продолжают очень медленно двигаться, представляясь друг другу."
    },
    {
      "title": "Marooned Game / Необитаемый остров",
      "people": "Komandas",
      "duration": "10 – 15 min.",
      "materials": "Papīra tāfele (flip chart), marķieri",
      "desc_lv": "Jūs esat pamesti uz salas. Kādus piecus (jūs varat izmantot citu skaitli, piemēram, septiņus, atkarībā no katras komandas lieluma) priekšmetus jūs būtu paņēmuši līdzi, ja zinātu, ka pastāv iespēja tikt izskalotiem vai iestrēgušiem. Ņemiet vērā, ka viņiem ir atļauti tikai pieci priekšmeti uz komandu, nevis uz cilvēku. Jūs varat likt viņiem uzrakstīt savus priekšmetus uz papīra tāfeles, apspriest un aizstāvēt savas izvēles ar visu grupu. Šī aktivitāte palīdz viņiem uzzināt par citu vērtībām un problēmu risināšanas stiliem un veicina komandas darbu.",
      "desc_ru": "Вы оказались на необитаемом острове. Какие пять (можно использовать другое число, например, семь, в зависимости от размера каждой команды) предметов вы бы взяли с собой, если бы знали, что есть шанс застрять. Обратите внимание, что им разрешено только пять предметов на команду, а не на человека. Вы можете заставить их записать свои предметы на флипчарте, обсудить и защитить свой выбор перед всей группой. Это упражнение помогает им узнать ценности других и стили решения проблем, а также способствует командной работе."
    },
    {
      "title": "Story Time Game / Время историй",
      "people": "Visi grupas dalībnieki aplī",
      "duration": "5 – 10 min.",
      "materials": "Nav",
      "desc_lv": "Vadītājs sāk stāstu, pasakot vienu teikumu. Pēc tam tas iet pa apli, katram cilvēkam pievienojot stāstam vienu teikumu – pēc tam, kad ir atkārtots katrs jau pievienotais teikums.",
      "desc_ru": "Ведущий начинает историю, произнося одно предложение. Затем она идет по кругу, каждый человек добавляет к истории по одному предложению — после повторения каждого предложения, которое уже было добавлено."
    },
    {
      "title": "Lucky Penny Game / Счастливая монета",
      "people": "Visi grupas dalībnieki",
      "duration": "5 – 10 min.",
      "materials": "Monētas",
      "desc_lv": "Katrs cilvēks izņem no kabatas santīmu vai citu monētu un apskatās datumu. Kad pienāk viņu kārta, viņi pasaka gadu, kas norādīts uz viņu monētas, un atceras kaut ko iespaidīgu, kas noticis tajā gadā.",
      "desc_ru": "Каждый человек достает из кармана монету и смотрит на дату. Когда наступает его очередь, он говорит год, указанный на монете, и вспоминает что-то впечатляющее, произошедшее в тот год."
    },
    {
      "title": "Four Facts Game / Четыре факта",
      "people": "Visi grupas dalībnieki",
      "duration": "10 – 15 min.",
      "materials": "Papīrs un pildspalvas",
      "desc_lv": "Katrs cilvēks pieraksta četrus faktus par sevi, no kuriem viens ir meli. Katrs pēc kārtas skaļi nolasa savu sarakstu, un pārējā komanda pieraksta to, ko viņi uzskata par meliem. Kad visi ir nolasījuši savus sarakstus skaļi, pirmā persona vēlreiz nolasa savu sarakstu un identificē melus. Komanda redz, cik labi viņiem veicās.",
      "desc_ru": "Каждый человек записывает четыре факта о себе, один из которых является ложью. Каждый по очереди зачитывает свой список вслух, а остальная команда записывает то, что они считают ложью. Когда все зачитают списки вслух, первый человек снова читает свой список и указывает на ложь. Команда видит, насколько хорошо они справились."
    },
    {
      "title": "A to Z Freeze Game / Алфавитная заморозка",
      "people": "Visi grupas dalībnieki",
      "duration": "5 – 10 min.",
      "materials": "Nav",
      "desc_lv": "Lūdziet dalībniekiem vienbalsīgi deklamēt alfabētu. Ļaujiet viņiem turpināt kādu laiku, līdz jūs jodelējat \"Stop!\". Tajā brīdī identificējiet burtu, pie kura viņi apstājās, un lūdziet visiem padalīties ar kaut ko tādu, ko viņi gaida skolā, kas sākas ar šo burtu. Piemēram, ja burts ir \"R\", viņi var teikt \"ravioli ēdnīcā\" vai \"istabas biedrs ar kādu foršu\". Kad visi ir dalījušies, lieciet viņiem atkārtoti skaitīt alfabētu. Apturiet tos uz cita burta un lūdziet dalībniekiem dalīties ar personības iezīmi, kas viņiem piemīt un sākas ar šo burtu. Ja burts ir \"D\" viņi var teikt tādas lietas kā \"centība\" vai \"muļķošanās\". Nāciet klajā ar dažādiem jautājumiem, ko uzdat katram burtam, un atkārtojiet procesu.",
      "desc_ru": "Попросите участников дружно декламировать алфавит. Пусть они продолжают некоторое время, пока вы не прокричите йоделем «Стоп!». В этот момент назовите букву, на которой они остановились, и попросите всех поделиться чем-то, чего они ждут в школе, что начинается на эту букву. Например, если буква «Р», они могут сказать «равиоли в столовой» или «комната с классным соседом». Когда все поделятся, заставьте их снова читать алфавит. Остановите их на другой букве и попросите участников поделиться чертой характера, которой они обладают и которая начинается с этой буквы. Если буква «Д», они могут сказать что-то вроде «дисциплина» или «дурашливость». Придумайте разные вопросы для каждой буквы и повторите процесс."
    },
    {
      "title": "Reception Line Game / Линия приема",
      "people": "Visi grupas dalībnieki",
      "duration": "5 – 10 min.",
      "materials": "Lukturītis (pēc izvēles)",
      "desc_lv": "Sadaliet visus 2 grupās. Lieciet viņiem nostāties pretī vienam otram. Katrs cilvēks sarunājas ar personu pretī, līdz saņem signālu (gaismas uzplaiksnījumu). Pēc signāla persona vienas līnijas galā pārvietojas uz otru galu. Līdz ar to katram ir jauna persona, ar ko aprunāties.",
      "desc_ru": "Разделите всех на 2 группы. Попросите их встать лицом друг к другу. Каждый человек разговаривает с человеком напротив до получения сигнала (вспышки света). По сигналу человек в конце одной линии перемещается на другой конец. В результате у каждого появляется новый собеседник."
    },
    {
      "title": "Autograph Sheets Game / Листы автографов",
      "people": "Visi grupas dalībnieki",
      "duration": "10 – 15 min.",
      "materials": "Lapas ar īpašībām un pildspalvas",
      "desc_lv": "Sagatavojiet lapu, kurā uzskaitītas cilvēku iezīmes vai fakti ar līniju, lai viņi varētu parakstīt savu vārdu blakus pazīmei, ja tā uz viņiem attiecas (ti: kāds, kurš nēsā kontaktlēcas, kāds, kurš ir bijis Eiropā utt.). Cilvēki tad staigā pa telpu ar savām lapām, cenšoties atrast cilvēkus, kuri ir tiesīgi parakstīt viņu lapas. Persona uz jebkuras lapas var parakstīties tikai vienu reizi. Procesu var arī apgriezt otrādi, liekot cilvēkiem meklēt to cilvēku autogrāfus, kuriem viņuprāt kategorija attiecas.",
      "desc_ru": "Подготовьте лист со списком черт или фактов о людях с линией для подписи рядом с чертой, если она к нему применима (т.е.: тот, кто носит контактные линзы, тот, кто был в Европе и т. д.). Люди ходят по комнате со своими листами, пытаясь найти людей, имеющих право подписать их лист. Человек может расписаться на любом листе только один раз. Процесс также можно обратить вспять, заставив людей искать автографы людей, к которым, по их мнению, относится категория."
    },
    {
      "title": "Find Someone Game / Найди кого-нибудь",
      "people": "Visi grupas dalībnieki",
      "duration": "5 – 10 min.",
      "materials": "Tukšas indeksa kartītes",
      "desc_lv": "Katrs cilvēks uz tukšas indeksa kartītes uzraksta vienu līdz trīs apgalvojumus, piemēram, mīļāko krāsu, intereses, vaļasprieku vai ceļojumus. Izsniedziet kartītes tā, lai katrs saņemtu kāda cita kartīti. Lieciet šai personai atrast cilvēku ar savu kartīti un iepazīstināt ar sevi.",
      "desc_ru": "Каждый человек пишет на пустой индексной карточке от одного до трех утверждений, таких как любимый цвет, интересы, хобби или поездки. Раздайте карточки так, чтобы каждый получил карточку кого-то другого. Попросите этого человека найти человека с его карточкой и представиться."
    },
    {
      "title": "Quick Change Artist Game / Мастер быстрых перевоплощений",
      "people": "Pāri",
      "duration": "5 – 10 min.",
      "materials": "Nav",
      "desc_lv": "Sadalieties pāros, stāvot pretī viens otram. Katram spēlētājam ir jānovēro sava partnera izskats. Tad spēlētāji pagriežas ar mugurām pret muguru un veic divas vai vairākas izmaiņas savā apģērbā, matu aksesuāros utt. Kad viņi atkal stājas pretī viens otram, katram partnerim ir jāidentificē izmaiņas, ko veicis viņa partneris.",
      "desc_ru": "Разбейте на пары лицом друг к другу. Каждый игрок должен наблюдать за внешностью своего партнера. Затем игроки поворачиваются спиной друг к другу и делают два или более изменения в своей одежде, аксессуарах для волос и т. д. Когда они снова поворачиваются лицом друг к другу, каждый партнер должен определить изменения, сделанные его партнером."
    },
    {
      "title": "Make a Date Game / Назначь свидание",
      "people": "Visi grupas dalībnieki",
      "duration": "15 – 20 min.",
      "materials": "Papīra šķīvji un pildspalvas",
      "desc_lv": "Iedodiet katram dalībniekam papīra šķīvi. Lieciet viņiem uzzīmēt pulksteņa ciparnīcu uz sava šķīvja ar līniju blakus katram skaitlim (bez ciparnīcām!). Pēc tam lieciet dalībniekiem staigāt apkārt un atrast \"randiņu\" katrai stundai, ierakstot viņu vārdu pie stundas. Āķis ir tāds, ka neviens nevar izveidot \"randiņu\" ar vairāk nekā vienu cilvēku stundā. Kad visi ir izveidojuši savus randiņus, paātriniet laiku un atvēliet 1-3 minūtes katrai stundai. Pēc tam vadītājs uzdod jautājumu diskusijai katrā randiņā.",
      "desc_ru": "Дайте каждому участнику бумажную тарелку. Пусть они нарисуют циферблат часов на своей тарелке с линией рядом с каждой цифрой (никаких цифровых часов!). Затем попросите участников походить вокруг и найти «свидание» для каждого часа, записав их имя возле часа. Подвох в том, что никто не может назначить «свидание» более чем одному человеку в час. После того как все назначат свидания, ускорьте время и выделите 1-3 минуты на каждый час. Затем ведущий задает вопрос для обсуждения на каждом свидании."
    },
    {
      "title": "Finish the Sentence Game / Заверши предложение",
      "people": "Visi grupas dalībnieki",
      "duration": "5 – 10 min.",
      "materials": "Tāfele un marķieris",
      "desc_lv": "Uzrakstiet jautājuma sākumu uz tāfeles (piem., \"Mans mīļākais darbs bija...\", \"Mans vaļasprieks ir...\") un apstaigājiet istabu, katram cilvēkam pabeidzot teikumu. Kad grupa ir pabeigusi, izlieciet citu jautājumu un sāciet no jauna.",
      "desc_ru": "Напишите начало вопроса на доске (например, «Моя любимая работа была...», «Мое хобби...») и обойдите комнату, каждый человек заканчивает предложение. Когда группа закончит, вывесите другой вопрос и начните заново."
    },
    {
      "title": "Juggling ball game / Игра с жонглированием мячом",
      "people": "5 – 20",
      "duration": "5 – 10 min.",
      "materials": "Bumba",
      "desc_lv": "Dalībnieki stāv aplī un met bumbu viens otram, nosaucot saņēmēja vārdu, izveidojot fiksētu modeli. Vēlāk tiek ieviestas papildu bumbas.",
      "desc_ru": "Участники стоят в кругу и бросают мяч друг другу, называя имя получателя, создавая фиксированный узор. Позже добавляются новые мячи."
    },
    {
      "title": "Names and adjectives / Имена и прилагательные",
      "people": "4+",
      "duration": "5 – 10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Dalībnieki izvēlas īpašības vārdu, kas sākas ar viņu vārda pirmo burtu (piem., \"es esmu Henrijs un esmu laimīgs\"), un var to parādīt ar žestu.",
      "desc_ru": "Участники выбирают прилагательное, начинающееся с первой буквы их имени (например, «я Анри, и я счастлив»), и могут показать его жестом."
    },
    {
      "title": "Connecting eyes / Соединение взглядами",
      "people": "6+",
      "duration": "5 – 10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Dalībnieki stāv aplī, veido acu kontaktu ar kādu pretējā pusē, mainās vietām, saglabājot kontaktu, vēlāk pievienojot sveicienus.",
      "desc_ru": "Участники стоят в кругу, устанавливают зрительный контакт с кем-то напротив, меняются местами, сохраняя контакт глазами, затем добавляют приветствия."
    },
    {
      "title": "Match the cards / Сопоставление карточек",
      "people": "Jebkurš (pāru skaits)",
      "duration": "5 – 10 min.",
      "materials": "Kartītes ar frāžu pusēm",
      "desc_lv": "Vadītājs sagatavo kartītes ar slaveno frāžu pusēm. Katrs izvelk kartīti un meklē cilvēku ar otru frāzes daļu.",
      "desc_ru": "Ведущий готовит карточки с половинками известных фраз. Каждый тянет карточку и ищет человека со второй частью фразы."
    },
    {
      "title": "Space on my right / Свободное место справа",
      "people": "6 – 20",
      "duration": "5 – 10 min.",
      "materials": "Krēsli",
      "desc_lv": "Dalībnieki sēž aplī ar vienu brīvu vietu pa labi no vadītāja. Blakus sēdošais pasauc kāda vārdu, lai tas pārsēžas, līdz visi ir pakustējušies.",
      "desc_ru": "Участники сидят в кругу с одним свободным местом справа от ведущего. Сидящий рядом вызывает кого-то занять место, пока все не сдвинутся."
    },
    {
      "title": "What we have in common / Что у нас общего",
      "people": "6+",
      "duration": "10 – 15 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Vadītājs sauc īpašību (piem., \"kam ir bērni\"), un attiecīgie dalībnieki pārvietojas uz norādīto stūri.",
      "desc_ru": "Ведущий выкрикивает характеристику (например, «у кого есть дети»), и обладатели этого признака переходят в указанный угол."
    },
    {
      "title": "Who are you? / Кто ты",
      "people": "5 – 20",
      "duration": "10 – 15 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Viens iziet, pārējie izvēlas viņam profesiju. Viņš atgriežas, un pārējie ar mimiku rāda darbības, lai viņš uzminētu.",
      "desc_ru": "Один выходит, остальные загадывают ему профессию. Он возвращается, а остальные показывают ее с помощью мимики и жестов."
    },
    {
      "title": "The sun shines on... / Солнце светит для...",
      "people": "6+",
      "duration": "5 – 10 min.",
      "materials": "Krēsli",
      "desc_lv": "Vadītājs centrā saka \"Saulīte spīd uz tiem, kam...\", un visi ar šo pazīmi mainās vietām; viens paliek centrā.",
      "desc_ru": "Ведущий в центре говорит: «Солнце светит для тех, у кого...», и обладатели этого признака меняются местами; остающийся без места водит."
    },
    {
      "title": "I'm going on a trip / Я отправляюсь в путешествие",
      "people": "6 – 20",
      "duration": "10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Aplī katrs saka \"Es dodos ceļojumā un ņemu līdzi...\", atkārtojot visu iepriekšējo sarakstu un pievienojot jaunu darbību vai priekšmetu.",
      "desc_ru": "В кругу каждый говорит: «Я отправляюсь в путешествие и беру с собой...», повторяя всю предыдущую цепочку и добавляя свое действие."
    },
    {
      "title": "My N.A.M.E. / Моё И.М.Я.",
      "people": "Jebkurš (ieteicami vismaz 6 dalībnieki)",
      "duration": "7–10 minūtes",
      "materials": "Nav",
      "desc_lv": "4. Mans VĀRDS",
      "desc_ru": "Дайте группе 5 минут, чтобы придумать интересные факты о себе, соответствующие буквам их имени. Попросите каждого участника озвучить получившуюся расшифровку. Например: «Привет, я Логан. Л — это Led Zeppelin, одна из моих любимых рок-групп. О — это Огайо, штат, где я живу. Г — это немецкий (German), единственный иностранный язык, который я знаю. А — это тетя (Aunt) Венди, моя любимая родственница. И Н — это \"милый\" (Nice), потому что я милый парень!»"
    },
    {
      "title": "Don't answer / Не отвечай",
      "people": "6+",
      "duration": "5 – 10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Viens jautā citam jautājumu, bet atbildēt drīkst tikai tas, kas sēž pa kreisi no uzrunātā.",
      "desc_ru": "Один задает вопрос участнику, но отвечать на него должен не тот, кому задали, а человек, сидящий слева от него."
    }
  ],
  teambuilding: [
    {
      "title": "Human Knot / Человеческий узел",
      "people": "komandas pa 6 – 12",
      "duration": "10 – 15 min.",
      "materials": "nav",
      "desc_lv": "Dalībnieki stāv aplī ar aizvērtām acīm, izstiepj labo roku uz vidu un satver citas personas roku. Atkārtojiet procesu, izmantojot kreiso roku. Pēc tam atveriet acis un atpiniet mezglu, neatbrīvojot rokas.",
      "desc_ru": "Участники стоят в кругу с закрытыми глазами, вытягивают правые руки в центр и берутся за руки другого человека. Повторите процесс, используя левую руку. Затем откройте глаза и распутайте узел, не расцепляя рук."
    },
    {
      "title": "Trust Walks / Прогулки доверия",
      "people": "pāri",
      "duration": "10 – 30 min.",
      "materials": "šalles acu aizsiešanai",
      "desc_lv": "Dalībnieki pēc kārtas tiek aizsietām acīm un pastaigājas kāda cita vadībā īsā pastaigā. Dalībniekiem pēc tam vajadzētu apspriest pieredzi (\"Es atklāju, ka..., es jutu...\").",
      "desc_ru": "Участники по очереди завязывают глаза и совершают короткую прогулку под руководством другого человека. После этого участники должны обсудить переживания («Я обнаружил, что..., я чувствовал...»)."
    },
    {
      "title": "Trust Falls / Падения на доверие",
      "people": "5 – 8",
      "duration": "5 – 20 min.",
      "materials": "krēsls",
      "desc_lv": "Dalībnieki nostājas uz paaugstinātas platformas (pietiks ar krēslu) un krīt atpakaļ citu dalībnieku rokās. Parasti cilvēki, kas stāv aiz krēsla, baidās vairāk nekā krītošais un satver viņu pārāk agri.",
      "desc_ru": "Участники встают на возвышенную платформу (стула будет достаточно) и падают назад на руки остальных участников. Обычно люди, стоящие за стулом, боятся больше, чем падающий человек, и хватают его слишком рано."
    },
    {
      "title": "Trust Falls 2 (Circle) / Падения на доверие в кругу, Voskovaja Svecha",
      "people": "komandas pa 7 – 12",
      "duration": "10 – 30 min.",
      "materials": "nav",
      "desc_lv": "Dalībnieki stāv aplī ap brīvprātīgo, kurš padara savu ķermeni stīvu un pēc tam krīt uz jebkuru pusi. Pārējie noķer brīvprātīgo un maigi stumj viņu atpakaļ uz centru, lai viņš/viņa kristu citā virzienā....",
      "desc_ru": "Участники стоят в кругу вокруг добровольца, который делает свое тело жестким, а затем падает в любую сторону. Остальные ловят добровольца и мягко толкают его обратно к центру, чтобы он(а) упал(а) в другом направлении...."
    },
    {
      "title": "Perfect Squares Exercise / Упражнение с идеальными квадратами",
      "people": "komandas pa 5",
      "duration": "25 – 45 min.",
      "materials": "sagatavoti puzles gabaliņi (kartona kvadrāti)",
      "desc_lv": "Katrai piecu cilvēku grupai tiek izsniegtas aploksnes ar dažādas formas kartona gabaliņiem. Grupas uzdevums ir izveidot piecus vienāda izmēra kvadrātus tā, lai katra grupas dalībnieka priekšā uz galda būtu pilnīgs kvadrāts. Noteikumi: neviens nedrīkst runāt, neviens nedrīkst lūgt citai personai gabaliņu vai signalizēt.\n\nInstrukcija:\nUz jūsu galda esošajā lielajā aploksnē ir piecas mazākas aploksnes.\nKatrā no tām ir dažādas formas kartona gabaliņi.\nJūsu grupas uzdevums ir izveidot piecus vienāda izmēra kvadrātus.\nAtkārtojam: uzdevums nav izpildīts, kamēr katram grupas dalībniekam priekšā uz galda nav pilnīga kvadrāta, kura izmērs ir vienāds ar visiem pārējiem kvadrātiem.\nIr spēkā šādi noteikumi:\n• Nevienam nav atļauts runāt.\n• Neviens nedrīkst lūgt citai personai gabaliņu vai citādā veidā signalizēt, ka viņam(-ai) ir nepieciešams konkrēts gabaliņš no citas personas.\n• Ikviena persona, ja viņš/viņa to vēlas, var novietot gabaliņus galda centrā vai dot gabaliņus jebkuram citam grupas dalībniekam.\n• Nevienam nav atļauts iejaukties citas personas figūrā.\n• Ikvienam ir ļauts ņemt gabaliņus no galda centra, bet neviens nedrīkst likt kopā nekādas detaļas, kas atrodas galda vidū.",
      "desc_ru": "Группам по пять человек раздаются конверты с кусочками картона разной формы. Задача группы — составить пять квадратов одинакового размера так, чтобы перед каждым членом группы лежал готовый квадрат. Правила: никто не имеет права говорить, никто не может просить у другого человека кусочек или подавать сигналы.\n\nИнструкция:\nВ большом конверте на вашем столе находятся пять меньших конвертов.\nВ каждом из них — кусочки картона разной формы.\nЗадача вашей группы — составить пять квадратов одинакового размера.\nПовторяем: задание не выполнено, пока перед каждым участником группы на столе нет полного квадрата, размер которого совпадает со всеми остальными квадратами.\nДействуют следующие правила:\n• Никому не разрешается говорить.\n• Никто не может просить у другого человека кусочек или иным образом сигнализировать, что ему(ей) нужен конкретный кусочек от другого человека.\n• Любой участник, если захочет, может класть кусочки в центр стола или отдавать кусочки любому другому члену группы.\n• Никому не разрешается вмешиваться в фигуру другого человека.\n• Каждый может брать кусочки из центра стола, но никто не имеет права собирать детали, находящиеся в середине стола.",
      "images": ["images/perfectsquares.png"]
    },
    {
      "title": "Birthday Game / День рождения",
      "people": "Visi grupas dalībnieki",
      "duration": "5 – 10 min.",
      "materials": "Nav",
      "desc_lv": "Lieciet grupai nostāties un izkārtoties taisnā līnijā. Kad viņi ir rindā, pasakiet viņiem pārkārtot līniju tā, lai viņi būtu sarindoti pēc savas dzimšanas dienas. 1. janvāris vienā galā un 31. decembris otrā galā. Āķis ir tāds, ka tas viss jāizdara bez runāšanas vai jebko pierakstīšanas.",
      "desc_ru": "Попросите группу встать и выстроиться в прямую линию. После того как они выстроились, скажите им перестроиться так, чтобы они располагались по порядку дней рождения. 1 января на одном конце и 31 декабря на другом. Подвох в том, что все это нужно сделать, не разговаривая и ничего не записывая."
    },
    {
      "title": "Straw & Paperclip Game / Соломинки и скрепки",
      "people": "Komandas",
      "duration": "15 – 20 min.",
      "materials": "Salmiņi (neelastīgie) un saspraužamie",
      "desc_lv": "Iedodiet katrai grupai salmiņu kasti un saspraužamo kasti. Pārbaudiet, vai saspraužamie var cieši ievietoties salmiņu galos. Dodiet katrai grupai uzdevumu (jūs varat izmantot vienu un to pašu katrai grupai, ja vēlaties) un ļaujiet viņiem darboties. Paraugu uzdevumi: Uzbūvējiet struktūru kā grupa – visaugstāko, spēcīgāko, garāko, radošāko, funkcionālāko utt. Debriefings ietver aprakstīšanu par komandas darbu un situatīvās līderības prasmēm, kā arī to, kā dažādi modeļi ir nepieciešami dažādu uzdevumu izpildei.",
      "desc_ru": "Дайте каждой группе коробку соломинок (негибких) и коробку скрепок. Проверьте, чтобы скрепки плотно входили в концы соломинок. Дайте каждой группе задание (можете использовать одно и то же для каждой группы, если хотите) и позвольте им действовать. Примерные задания: постройте структуру как группа — самую высокую, самую прочную, самую длинную, самую креативную, самую функциональную и т. д. Обсуждение включает описание навыков командной работы и ситуационного лидерства, а также того, как разные модели необходимы для выполнения разных задач."
    },
    {
      "title": "Puzzles Game / Пазлы",
      "people": "Visi grupas dalībnieki",
      "duration": "10 min.",
      "materials": "Kartona gabaliņi vai indeksa kartītes",
      "desc_lv": "Iedodiet dalībniekiem tukšu puzles gabalu (sagrieziet indeksa kartītes lapu). Katrs cilvēks uz gabala uzraksta vienu prasmi, ko viņš dod ieguldījumā grupai. Pēc tam puzle tiek salikta, lai parādītu, ka katrs dod ieguldījumu kopumā.",
      "desc_ru": "Дайте участникам пустой кусочек пазла (разрежьте лист индексных карточек). Каждый человек пишет на кусочке один навык, который он вносит в группу. Затем пазл собирается, чтобы показать, что каждый вносит свой вклад в целое."
    },
    {
      "title": "Human Knot Game + / Человеческий узел +",
      "people": "Grupas pa 6–10 cilvēkiem",
      "duration": "10 – 15 min.",
      "materials": "Nav",
      "desc_lv": "Sadaliet grupās pa 6-10 cilvēkiem. Katra grupa veido ciešu apli, stāvot un vērstiem vienam pret otru. Visi izstiepj rokas aplī un, savijot rokas, satver citu grupas dalībnieku rokas. Instruējiet cilvēkus: \"pārliecinieties, ka abas rokas, ko turat, nepieder vienam un tam pašam cilvēkam\". Grupas mērķis: atpiniet rezultātā radušos mezglu. Grupas locekļi fiziski rāpjas pāri / zem / cauri viens otra rokām, lai atraisītu ķermeņu mezglu. Piezīme: Tas ir RETI, bet ir iespējams, ka mezgls ir neatrisināms vai beidzas divos atsevišķos apļos.",
      "desc_ru": "Разделитесь на группы по 6-10 человек. Каждая группа образует тесный круг, стоя лицом друг к другу. Все вытягивают руки в круг и переплетая руки, берутся за руки с другими членами группы. Инструктируйте людей: «убедитесь, что две руки, которые вы держите, не принадлежат одному и тому же человеку». Цель группы: распутать получившийся узел. Члены группы физически перелезают через/под/через руки друг друга, чтобы распутать узел тел. Примечание: Это РЕДКО, но возможно, что узел окажется неразрешимым или распадется на два отдельных круга."
    },
    {
      "title": "Get in the News Game / Попасть в новости",
      "people": "Komandas pa 4–5 cilvēkiem",
      "duration": "20 – 30 min.",
      "materials": "Šķēres, līmlente, spraudītes, avīzes",
      "desc_lv": "Sadaliet savu grupu komandās pa četriem vai pieciem cilvēkiem un pārliecinieties, ka katrai komandai ir nepieciešamie piederumi – šķēres, līmlente, spraudītes un daudz vecu avīžu. Jums būs nepieciešama arī atsevišķa telpa vai stūris, kur katra komanda var strādāt privātumā (un jautrībā). Katra grupa izvēlas vienu personu par modeli. Pēc tam, kad izlemts, kādu tērpu izgatavot, komanda ķeras pie darba – griež, burza, krudina, rullē, liek kopā, sprauž, līmē. Pēc pienācīga laika summas pasauciet visus kopā uz tērpu šovu.",
      "desc_ru": "Разделите вашу группу на команды по четыре-пять человек и убедитесь, что у каждой команды есть необходимые принадлежности — ножницы, скотч, булавки и много старых газет. Вам также понадобится отдельная комната или угол, где каждая команда может работать в уединении. Каждая группа выбирает одного человека в качестве модели. Решив, какой костюм сделать, команда берется за работу — режет, мнет, сминает, сворачивает, соединяет, скалывает. По истечении времени соберите всех вместе на показ костюмов."
    },
    {
      "title": "Kangaroo Court Game / Кенгуру-суд",
      "people": "Visi grupas dalībnieki",
      "duration": "15 – 20 min.",
      "materials": "Oficiālās apsūdzības materiāli",
      "desc_lv": "Izmēģiniet šo, ja ir incidents, kas kaitina jūsu grupas dalībniekus. Paziņojiet, ka tiks rīkota ķengura tiesa, lai pienācīgi tiesātu un sauktu pie atbildības visas vainīgās puses. Pēc paziņojuma visi sāks skatīties uz attiecīgo incidentu ar humora izjūtu. Nosauciet apsūdzētos. Izvēlieties aizstāvības advokātu, kā arī prokuroru. Uzrakstiet oficiālas apsūdzības un iesniedziet tās tiesnesim. Ieceliet tiesu izpildītāju un tiesas sekretāru. Pārbaudiet un zvēriniet savus zvērinātos.",
      "desc_ru": "Попробуйте это, если есть инцидент, раздражающий членов вашей группы. Объявите, что будет проведен кенгуру-суд для надлежащего суда и привлечения к ответственности всех виновных сторон. После вашего объявления все начнут смотреть на обсуждаемый инцидент с чувством юмора. Назовите ответчиков. Выберите адвоката защиты, а также прокурора. Напишите официальные обвинения и представьте их судье. Назначьте судебного пристава и судебного секретаря. Проверьте и приведите к присяге ваших присяжных."
    },
    {
      "title": "Sunshine Cards Game / Солнечные открытки",
      "people": "Visi grupas dalībnieki",
      "duration": "10 min.",
      "materials": "Papīra lapas un pildspalvas",
      "desc_lv": "Katrs uzraksta savu vārdu papīra lapas centrā un uzzīmē sauli ap savu vārdu. Nododiet savu lapu personai pa labi. Šī persona uzrakstīs kaut ko pozitīvu par jums, un viņai nav jāparaksta savs vārds. Turpiniet nodot savu vārdu/lapu apkārt, līdz visi ir uzrakstījuši kaut ko uz visām lapām.",
      "desc_ru": "Каждый пишет свое имя в центре листа бумаги и рисует солнце вокруг своего имени. Передайте свой лист человеку справа. Этот человек напишет что-то положительное о вас, и ему не нужно подписывать свое имя. Продолжайте передавать свое имя по кругу, пока каждый не напишет что-то на всех листах."
    },
    {
      "title": "Who is the leader? / Кто лидер",
      "people": "6 – 20",
      "duration": "10 – 15 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Viens dalībnieks iziet, pārējie izvēlas līderi, kurš rāda kustības. Atgriezies dalībnieks mēģina uzminēt, kurš ir līderis.",
      "desc_ru": "Один участник выходит, остальные выбирают «лидера», который задает движения. Вернувшийся участник пытается угадать, кто лидер."
    },
    {
      "title": "Family members / Члены семьи",
      "people": "10+",
      "duration": "10 min.",
      "materials": "Kartītes ar lomām",
      "desc_lv": "Dalībnieki saņem kartītes ar ģimeņu lomām (dzīvnieki, profesijas). Pēc signāla \"ģimenes salidojums\" viņi meklē savas grupas locekļus, lai pēc tam strādat jaunizvedotā grupā..",
      "desc_ru": "Участники получают карточки с ролями членов семей (профессии, животные). По сигналу «семейный сбор» они быстро находят свою группу для дальнейшей работы в новосозданной группе."
    },
    {
      "title": "The animal game / Игра в животных",
      "people": "10+",
      "duration": "5 min.",
      "materials": "Lapiņas ar dzīvnieku nosaukumiem",
      "desc_lv": "Dalībnieki saņem lapiņas ar dzīvniekiem un, izdodot attiecīgās skaņas, meklē savas grupas biedrus un turpmāk darbojas savā grupā.",
      "desc_ru": "Участники получают записки с названиями животных и, издавая звуки своих животных, ищут членов своей команды и остаются работать в своих командах."
    },
    {
      "title": "Paper and straws / Бумага и соломинки",
      "people": "Komandas",
      "duration": "10 min.",
      "materials": "Papīra lapa, kokteiļu salmiņi",
      "desc_lv": "Komandas rindā ar salmiņu palīdzību (sūcot gaisu) pārnes kartīti no viena dalībnieka otrajam bez rokām.",
      "desc_ru": "Команды в колоннах передают карточку бумаги с помощью коктейльных трубочек (втягивая воздух), не используя руки."
    },
    {
      "title": "The longest line / Самая длинная линия",
      "people": "Komandas (8 – 10 cilvēki)",
      "duration": "10 min.",
      "materials": "Apģērbs, mantas no kabatām",
      "desc_lv": "Komandas sacenšas, kura izveidos visgarāko līniju no saviem ķermeņiem un drēbēm/mantām no kabatām noteiktā laikā.",
      "desc_ru": "Команды соревнуются, кто сможет построить самую длинную линию из собственных тел, одежды и предметов из карманов за время."
    },
    {
      "title": "Robots / Роботы",
      "people": "Pa 3",
      "duration": "10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Viens ir kontrolieris, divi ir roboti. Pieskaroties labajam/kreisajam plecam, kontrolieris vada robotu gaitu, izvairoties no šķēršļiem.",
      "desc_ru": "Один контроллер управляет двумя «роботами», касаясь их правого или левого плеча, чтобы направлять их в обход препятствий."
    },
    {
      "title": "Pass the person / Передай человека",
      "people": "10+",
      "duration": "10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Divas rindas pretī viena otrai tura rokas, un brīvprātīgais guļ uz rokām, tiekot maigi pārvietots līdz rindas galam.",
      "desc_ru": "Две шеренги стоят друг напротив друга, держа за руки. Доброволец ложится на руки и мягко переносится до конца шеренги."
    },
    {
      "title": "Blindfold pairs / Слепые пары",
      "people": "Pāri",
      "duration": "10 min.",
      "materials": "Aizsegs acīm",
      "desc_lv": "Viens aizsien acis, otrs ar balss palīdzību un norādēm vada viņu caur šķēršļu joslu (šķēršļi pirms tam klusām novākti).",
      "desc_ru": "Один закрывает глаза повязкой, а партнер голосом направляет его через (уже убранную) полосу препятствий."
    },
    {
      "title": "I like you because... / Ты мне нравишься, потому что...",
      "people": "6+",
      "duration": "5 – 10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Dalībnieki sēž aplī un pēc nelielas apdomāšanās pasaka cilvēkam pa labi, kas viņā patīk vai tiek novērtēts.",
      "desc_ru": "Участники сидят в кругу и по очереди говорят человеку справа, за что они его ценят или что в нем нравится."
    },
    {
      "title": "Heads to tummies / Голова на животе",
      "people": "6+",
      "duration": "5 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Dalībnieki guļ uz grīdas ķēdē, katram uzliekot galvu uz blakus stāvošā vēdera. Sākas smieklu vilnis.",
      "desc_ru": "Участники ложатся на пол цепочкой, кладя голову на живот друг другу. Кто-то начинает смеяться, вызывая цепную реакцию смеха."
    },
    {
      "title": "Ball under chins / Мяч под подбородком",
      "people": "Komandas",
      "duration": "10 min.",
      "materials": "Papīra bumbiņas",
      "desc_lv": "Komandas rindā nodod mazu bumbiņu, turot to zem zoda bez rokām. Ja bumbiņa nokrīt, sāk no jauna.",
      "desc_ru": "Команды в колоннах передают мячик, удерживая его под подбородком без помощи рук. Если мячик падает, все начинается сначала."
    },
    {
      "title": "Knees up / Колени вверх",
      "people": "6+",
      "duration": "5 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Dalībnieki stāv ciešā aplī, pagriežas uz sāniem un uzmanīgi apsēžas uz aizmugurē stāvošā ceļiem, veidojot apli.",
      "desc_ru": "Участники стоят в плотном кругу, поворачиваются боком и аккуратно садятся на колени стоящему позади, образуя единое кольцо."
    }
  ],
  physical: [
    {
      "title": "Back 2 Back / Спина к спине",
      "people": "pāri",
      "duration": "5 – 10 min.",
      "materials": "nav",
      "desc_lv": "Apsēdieties ar mugurām pret muguru: piecelieties, apsēdieties atkal.",
      "desc_ru": "Сядьте спина к спине: встаньте, сядьте снова."
    },
    {
      "title": "Aeroplane / Самолет",
      "people": "komandas pa 5",
      "duration": "10 – 20 min.",
      "materials": "nav",
      "desc_lv": "Četri cilvēki paņem brīvprātīgā rokas un kājas un skrien pa pagalmu ar savu \"lidmašīnu\". Lūdzu, bez reālas pacelšanās gaisā (t.i., faktiski palaist vaļā vai nomest cilvēku nav ļauts!).",
      "desc_ru": "Четыре человека берут за руки и ноги добровольца и бегут по двору со своим «самолетом». Пожалуйста, без реального взлета (то есть фактически не отпускайте и не бросайте человека!)."
    },
    {
      "title": "Up & Fly / Вверх и летим",
      "people": "komandas pa 5 – 7",
      "duration": "10 min.",
      "materials": "nav",
      "desc_lv": "Dalībnieki stāv aplī, brīvprātīgais centrā lec uz augšu un uz leju; pārējie palīdz ar rokām, lai sasniegtu augstumu.",
      "desc_ru": "Участники стоят в кругу, доброволец в центре подпрыгивает вверх и вниз; остальные помогают своими руками достичь высоты."
    },
    {
      "title": "Out on the Town Game / Городские приключения",
      "people": "Visi grupas dalībnieki",
      "duration": "5 min.",
      "materials": "Nav",
      "desc_lv": "Ja jums ir divu dienu sanāksme un otrās dienas sākumā nepieciešama ātra iesildīšanās, palūdziet visiem ar pantomīmu attēlot kaut ko tādu, ko viņi darīja iepriekšējā vakarā. Individuālie dalībnieki vai grupas var atveidot filmu, uz kuru viņi gāja, aprakstīt maltīti, ko viņi apēda, vai atjaunot bārā redzētu skatu...",
      "desc_ru": "Если у вас двухдневная встреча и вам нужна быстрая разминка для второго дня, попросите каждого спантомимировать то, что они делали накануне вечером. Отдельные лица или группы могут разыграть фильм, на который они ходили, описать съеденный обед или воссоздать сцену, увиденную в баре..."
    },
    {
      "title": "Howdy Howdy / Привет-привет",
      "people": "6+",
      "duration": "5 – 10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Dalībnieki stāv aplī. Viens cilvēks iet apkārt aplim, pieskaras kādam pie pleca, abi skrien pretējos virzienos, satiekas, trīs reizes sveicinās un skrien uz brīvo vietu.",
      "desc_ru": "Участники стоят в кругу. Один человек идет по кругу, хлопает кого-то по плечу, они бегут в противоположных направлениях, встречаются, трижды приветствуют друг друга и соревнуются за свободное место."
    },
    {
      "title": "What kind of animal? / Какое животное",
      "people": "Pāra skaits (6 – 20)",
      "duration": "10 – 15 min.",
      "materials": "Krēsli",
      "desc_lv": "Pāri slepeni izvēlas dzīvnieku. Divi bez krēsliem ir ziloņi un uzmin dzīvniekus, kuri seko viņiem, līdz sauc \"Lauvas!\" un visi skrien pēc krēsliem.",
      "desc_ru": "Пары секретно выбирают животное. Двое без стульев — слоны, отгадывают животных, которые идут за ними, пока не крикнут «Львы!», и все бегут занимать стулья."
    },
    {
      "title": "COCONUT / КОКОС",
      "people": "Jebkurš",
      "duration": "3 – 5 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Vadītājs rāda, kā izrunāt un izkustēties, pa burtiem izrunājot vārdu C-O-C-O-N-U-T ar pilnām ķermeņa kustībām.",
      "desc_ru": "Ведущий показывает, как с помощью полной подвижности рук и тела по буквам проскладывать слово К-О-К-О-С."
    },
    {
      "title": "Body writing / Написание телом",
      "people": "Jebkurš",
      "duration": "5 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Dalībnieki raksta savu vārdu gaisā ar dažādām ķermeņa daļām (elkonis, kāja u.c.).",
      "desc_ru": "Участники пишут свое имя в воздухе различными частями тела (например, локтем или ногой)."
    },
    {
      "title": "Names in the air / Имена в воздухе",
      "people": "Jebkurš",
      "duration": "3 – 5 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Dalībnieki raksta savu vārdu gaisā vispirms ar labo roku, tad ar kreiso, un visbeidzot ar abām rokām reizē.",
      "desc_ru": "Участники пишут свое имя в воздухе сначала правой рукой, затем левой, а в конце — обеими руками одновременно."
    },
    {
      "title": "As and Bs / А и Б",
      "people": "6 – 20",
      "duration": "10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Katrs klusībā izvēlas divus cilvēkus: \"A\" (kam jāseko) un \"B\" (no kā jābēg). Visi vienlaikus mēģina tikt tuvu savam \"A\" un tālu no \"B\".",
      "desc_ru": "Каждый молча выбирает человека «А» (к которому надо приблизиться) и человека «Б» (от которого надо держаться подальше). Все двигаются одновременно."
    },
    {
      "title": "Group statues / Групповые статуи",
      "people": "6+",
      "duration": "10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Dalībnieki brīvi kustas telpā, vadītājs izsauc vārdu (piem., \"miers\"), un dalībnieki bez vārdiem veido statuju, kas to attēlo.",
      "desc_ru": "Участники двигаются по комнате, ведущий выкрикивает слово (например, «мир»), и группа замирает в позах, отражающих это понятие."
    },
    {
      "title": "Move to the spot / Движение к точке",
      "people": "6+",
      "duration": "10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Katrs izvēlas savu vietu. Pēc komandas visi staigā un veic uzdevumus. Pēc \"Stop!\" visiem jāskrien uz savu sākuma vietu.",
      "desc_ru": "Каждый выбирает свою точку. По команде все ходят по комнате определенным образом. По сигналу «Стоп!» все бегут на свои исходные точки."
    },
    {
      "title": "Taxi rides / Поездка на такси",
      "people": "10+",
      "duration": "5 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Dalībnieki izliekas, ka brauc taksometros, kas ietilpina noteiktu skaitu (2, 4, 8). Vadītājs nosauc skaitu, un dalībnieki ātri apvienojas grupās.",
      "desc_ru": "Участники «ловят такси» определенной вместимости (2, 4 или 8 человек). Ведущий называет число, и участники быстро сбиваются в группы."
    },
    {
      "title": "Fruit salad / Фруктовый салат",
      "people": "8+",
      "duration": "10 min.",
      "materials": "Krēsli",
      "desc_lv": "Dalībnieki sadalīti augļu grupās un sēž aplī. Vadītājs centrā sauc augli, tie mainās vietām; sauciens \"fruktu salāti\" nozīmē, ka mainās visi.",
      "desc_ru": "Участники делятся на группы фруктов и сидят в кругу. Ведущий в центре называет фрукт, они меняются местами; «фруктовый салат» — меняются все."
    },
    {
      "title": "\"Prrr\" and \"Pukutu\" / «Пррр» и «Пукуту»",
      "people": "6+",
      "duration": "5 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Vadītājs sauc putnu skaņas. Uz \"Prrr\" visi pieceļas uz pirkstgaliem un kustina elkoņus kā spārnus; uz \"Pukutu\" stāv pilnīgi nekustīgi.",
      "desc_ru": "Ведущий имитирует звуки птиц. На «Пррр» все встают на носки и машут локтями-крыльями; на «Пукуту» замирают на месте."
    },
    {
      "title": "Dancing on paper / Танцы на бумаге",
      "people": "Pāri",
      "duration": "10 min.",
      "materials": "Avīzes vai auduma gabali",
      "desc_lv": "Pāri dejo uz avīzes. Kad mūzika apstājas, avīze tiek locīta uz pusi. Pāri, kas nokrīt no papīra uz grīdas, izkrīt.",
      "desc_ru": "Пары танцуют на газете. Когда музыка останавливается, газету складывают пополам. Упавшие с бумаги на пол выбывают."
    },
    {
      "title": "Tide's in/tide's out / Прилив и отлив",
      "people": "6+",
      "duration": "5 min.",
      "materials": "Līnija uz grīdas",
      "desc_lv": "Dalībnieki stāv aiz līnijas. Vadītājs sauc \"Tide's out!\" (lēciens uz priekšu) vai \"Tide's in!\" (lēciens atpakaļ). Ja divreiz pasauc to pašu, kustīgie izkrīt.",
      "desc_ru": "Участники стоят за линией. Ведущий кричит «Прилив!» (прыжок вперед) или «Отлив!» (назад). Ошибившиеся дважды выбывают."
    },
    {
      "title": "Delhi buses / Делийские автобусы",
      "people": "10+",
      "duration": "10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Daži dalībnieki ir \"vadītāji\", pārējie - \"pasažieri\". Vadītāji brauc pa telpu, izdodot skaņas un vācot pasažierus aizmugurē.",
      "desc_ru": "Несколько участников — «водители», остальные — «пассажиры». Водители ездят по комнате со звуками мотора, собирая пассажиров в колонны."
    },
    {
      "title": "Rabbits / Кролики",
      "people": "8+",
      "duration": "5 – 10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Viens rāda \"truša ausis\" ar abām rokām, kaimiņi – ar vienu roku. Pirmais rāda uz citu aplī, kurš kļūst par nākamo trusi.",
      "desc_ru": "Один делает «уши кролика» обеими руками, соседи — одной рукой. Первый указывает на другого в кругу, кто становится новым кроликом."
    },
    {
      "title": "Port/starboard / Порт и правый борт",
      "people": "8+",
      "duration": "5 – 10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Dalībnieki skrien pa telpu atbilstoši komandām: \"Starboard\" (pa labi), \"Port\" (pa kreisi), \"Man the ship\" (uz centru) u.c.",
      "desc_ru": "Участники перемещаются по комнате по командам: «Старборд» (направо), «Порт» (налево), «К бою» (в центр) и др."
    },
    {
      "title": "Find someone wearing... / Найди того, на ком надето...",
      "people": "6+",
      "duration": "5 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Vadītājs sauc apģērba gabalu, un dalībniekiem ātri jāpieglaužas pie cilvēka, kam tas ir mugurā.",
      "desc_ru": "Ведущий выкрикивает элемент одежды, и участники должны быстро подбежать и встать рядом с тем, у кого это надето."
    },
    {
      "title": "Touch something blue / Коснись чего-то синего",
      "people": "6+",
      "duration": "5 min.",
      "materials": "Priekšmeti telpā",
      "desc_lv": "Vadītājs liek visiem atrast un pieskarties noteiktas krāsas vai veida priekšmetam (piem., kautkam ziliem).",
      "desc_ru": "Ведущий просит всех найти и коснуться определенного предмета в комнате (например, чего-то синего)."
    },
    {
      "title": "Simon says / Саймон говорит",
      "people": "6+",
      "duration": "5 – 10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Dalībnieki izpilda vadītāja komandas tikai tad, ja tās sākas ar \"Simon says...\". Ja frāze netiek pateikta, izpildītāji izkrīt.",
      "desc_ru": "Участники выполняют команды ведущего только тогда, когда они начинаются со слов «Саймон говорит...». Ошибившиеся выбывают."
    },
    {
      "title": "Five islands / Пять островов",
      "people": "8+",
      "duration": "10 min.",
      "materials": "Krīts vai atzīmes uz grīdas",
      "desc_lv": "Uz grīdas uzzīmē 5 apļus-\"salas\". Vadītājs paziņo, ka viena sala grimst, un iedzīvotājiem jāskrien uz citām, līdz visi saspiežas uz vienas.",
      "desc_ru": "На полу рисуют 5 кругов-«островов». Ведущий объявляет, что один остров тонет, и все бегут на остальные, пока не останутся на одном."
    },
    {
      "title": "Bring me / Принеси мне",
      "people": "8+",
      "duration": "10 min.",
      "materials": "Dažādi priekšmeti telpā",
      "desc_lv": "Vadītājs sadala komandās un prasa atnest konkrētu priekšmetu (piem., \"sieviešu apavus vīrieša kājās\"). Komandas sacenšas ātrumā.",
      "desc_ru": "Ведущий делит участников на команды и просит принести определенный предмет (например, «женскую обувь на мужских ногах»). Соревнуются на скорость."
    },
    {
      "title": "The king is dead / Король умер",
      "people": "6 – 20",
      "duration": "10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Pirmais saka \"Karalis ir miris!\", otrais prasa \"Kā viņš nomira?\", pirmais parāda žestu. Visi atkārto, un ķēde turpinās ar jauniem žestiem.",
      "desc_ru": "Первый говорит: «Король умер!», второй: «Как он умер?», первый показывает жест. Все повторяют, цепочка продолжается с новыми движениями."
    },
    {
      "title": "Locomotion / Передвижение",
      "people": "8+",
      "duration": "10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Vadītājs centrā atdarina transportu (mašīnu, vilcienu), piesaista dalībniekus, tad sauc \"Maināmies!\", un visi skrien pēc krēsliem.",
      "desc_ru": "Ведущий в центре имитирует движение транспорта, собирает хвост из участников, затем кричит «Все меняется!», и все борются за стулья."
    },
    {
      "title": "Tug of war / Перетягивание каната",
      "people": "8+",
      "duration": "5 – 10 min.",
      "materials": "Virve",
      "desc_lv": "Dalībnieki sadalās divās komandās un velk virvi pretējos virzienos.",
      "desc_ru": "Участники делятся на две команды и перетягивают канат в противоположные стороны."
    },
    {
      "title": "Fox and rabbit / Лиса и кролик",
      "people": "8+",
      "duration": "5 – 10 min.",
      "materials": "Divi dažādi lakati",
      "desc_lv": "Aplī padod divus lakatus («Lapsa» ar 1 mezglu, «Trusis» ar 2 mezgliem), kas ceļo pa apli. Lapsa pārvietojas ātrāk un ķer trusi.",
      "desc_ru": "По кругу передают два платка («Лиса» с 1 узлом и «Кролик» с 2 узлами). Лиса движется быстрее и догоняет кролика."
    },
    {
      "title": "Pass the energy / Передай энергию",
      "people": "6+",
      "duration": "5 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Dalībnieki stāv vai sēž aplī, turot rokas, un klusumā padod \"impulsu\" (saspiežot roku), kas ceļo pa apli.",
      "desc_ru": "Участники стоят или сидят в кругу, держась за руки, и молча передают «импульс» (пожатием руки) по кругу."
    },
    {
      "title": "Dragon's tail / Хвост дракона",
      "people": "10+",
      "duration": "10 min.",
      "materials": "Lakati vai lentes",
      "desc_lv": "Komandas veido \"drakonus\", turot cits citu aiz vidukļa. Pēdējam ir aste (lente). Mērķis ir noķert otra drakona asti.",
      "desc_ru": "Команды выстраиваются в «драконов», держась за талии впереди стоящих. У последнего в хвосте лента. Задача — сорвать хвост другого дракона."
    },
    {
      "title": "Group massage / Групповой массаж",
      "people": "6+",
      "duration": "5 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Dalībnieki nostājas aplī, pagriežas uz sāniem un masē plecus cilvēkam, kurš stāv priekšā.",
      "desc_ru": "Участники встают в круг и поворачиваются боком, чтобы делать массаж плеч человеку, стоящему впереди."
    },
    {
      "title": "Get up, sit down! / Встань, сядь!",
      "people": "6+",
      "duration": "5 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Katrs saņem numuru. Vadītājs stāsta stāstu, kurā minēti skaitļi; dzirdot savu numuru, dalībniekam jāpiecelas.",
      "desc_ru": "Каждому присваивается номер. Ведущий рассказывает историю с множеством чисел; услышав свой номер, участник должен встать."
    }
  ],
  mental: [
    {
      "title": "The Quiet Game / Тихая игра",
      "people": "Pāri vai komandas",
      "duration": "5 min.",
      "materials": "Nav",
      "desc_lv": "Instruktoram paskaidrojot, šis vingrinājums prasa paškontroli. Dalībnieki nostājas muguru pret muguru. Uz skaitli trīs visiem ir jāpagriežas pret savu partneri, jāskatās viens otram acīs un jācenšas saglabāt svinīgu un nopietnu sejas izteiksmi. Bez runāšanas! Pirmais, kurš pasmaida vai iesmejas, ir spiests apsēsties. Visi, kas paliek stāvam, tad ņem jaunu partneri, un aktivitāte turpinās, kamēr tikai viena persona nav smaidījusi vai smējusies.",
      "desc_ru": "Инструктор объясняет, что это упражнение требует самоконтроля. Участники встают спиной к спине. На счет три все должны повернуться к своему партнеру, посмотреть друг другу в глаза и попытаться оставаться торжественными и серьезными. Никаких разговоров! Первый, кто улыбнется или рассмеется, должен сесть. Все оставшиеся стоять берут нового партнера, и активность продолжается до тех пор, пока только один человек не улыбнется или не засмеется."
    }
  ],
  creative: [
    {
      "title": "Positive Reinforcement Cards Game / Карты позитивного подкрепления",
      "people": "Visi grupas dalībnieki",
      "duration": "Visas dienas garumā / noslēgumā",
      "materials": "Kāršu kavas spēļu kartes",
      "desc_lv": "Ikreiz, kad dalībnieks ierodas uz nodarbību laikā no pārtraukumiem, pusdienām utt., iedodiet viņam vienu kāršu kavas spēļu karti. Jūs varat arī izdalīt kartītes cilvēkiem, kuri piesakās aktivitātēm, ir noderīgi, atbild uz sarežģītu jautājumu utt. Dienas beigās izspēlējiet vienu pokera kombināciju. Piešķiriet mazu balvu labākajai kombinācijai (jūs varat izvēlēties arī divas vai trīs labākās kombinācijas, ja vēlaties izdalīt vairāk balvu). Ņemiet vērā, ka jo vairāk kartīšu cilvēkam ir, jo lielāka ir uzvaras iespēja.",
      "desc_ru": "Каждый раз, когда участник вовремя приходит на занятие с перерывов, обеда и т. д., давайте ему одну игральную карту. Вы также можете раздавать карты людям, которые вызвались добровольцами для участия в мероприятиях, полезны, отвечают на сложный вопрос и т. д. В конце дня сыграйте одну руку в покер. Дайте небольшой приз лучшей комбинации (вы также можете выбрать две или три лучшие комбинации, если хотите раздать больше призов). Обратите внимание, что чем больше карт у человека, тем выше шансы на победу."
    },
    {
      "title": "Killer wink / Убийственный подмиг",
      "people": "6 – 25",
      "duration": "10 – 15 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Slepeni izvēlēts \"slepkava\" nogalina citus, ar aci pamirkšķinot. Pārējie staigā un cenšas uzminēt, kas ir slepkava.",
      "desc_ru": "Секретно выбранный «убийца» устраняет жертв подмигиванием. Участники ходят по комнате и пытаются вычислить убийцу."
    },
    {
      "title": "Banana game / Игра в банан",
      "people": "6 – 20",
      "duration": "10 min.",
      "materials": "Banāns vai neliels priekšmets",
      "desc_lv": "Dalībnieki stāv aplī ar rokām aiz muguras. Cilvēks centrā mēģina uzminēt, kuram aiz muguras slēpts priekšmets.",
      "desc_ru": "Участники стоят в кругу с руками за спиной. Доброволец в центре пытается угадать, у кого в руках скрытно передается предмет."
    },
    {
      "title": "Body \"tig\" / Телесные пятнашки",
      "people": "6+",
      "duration": "5 – 10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Vadītājs noķer kādu un norāda konkrētu ķermeņa daļu. Visi drīkst ķert citus tikai ar šo ķermeņa daļu.",
      "desc_ru": "Ведущий осаливает игрока и задает часть тела. Теперь игроки могут осаливать других только этой частью тела."
    },
    {
      "title": "Mime a lie / Имитация лжи",
      "people": "6 – 20",
      "duration": "10 min.",
      "materials": "Nav nepieciešami",
      "desc_lv": "Viens rāda darbību un saka kaut ko citu (piem., peld un saka \"es mazgāju matus\"). Nākamais atkārto darbību, bet saka jaunu lietu.",
      "desc_ru": "Один показывает одно действие, а говорит другое (например, плывет и говорит «я мою волосы»). Следующий изображает названное действие."
    },
    {
      "title": "Pass the parcel / Передай свёрток",
      "people": "6 – 20",
      "duration": "15 min.",
      "materials": "Ietīta dāvana ar uzdevumiem uz slāņiem",
      "desc_lv": "Mūzikas pavadījumā padod dāvanu, kas ietīta daudzās kārtās. Kad mūzika apstājas, atver vienu kārtu un izpilda uzdevumu.",
      "desc_ru": "Под музыку передают сверток с множеством слоев бумаги. Когда музыка останавливается, держащий снимает слой и выполняет задание."
    },
    {
      "title": "King of the Jungle / Король джунглей",
      "people": "8 – 20",
      "duration": "10 min.",
      "materials": "Krēsli",
      "desc_lv": "Dalībnieki sēž puslokā, katrs ir dzīvnieks ar savu zīmi (zilonis ir karalis, pērtiķis galā). Rāda zīmes un mēģina tikt līdz karaļa krēslam.",
      "desc_ru": "Участники сидят в полукруге, каждый — животное со своим знаком (слон — король, мартышка — в конце). Передают знаки, стремясь занять место короля."
    }
  ],
  brainstorm: [
    {
      "title": "Yes, And / Да, и",
      "people": "2 vai vairāk",
      "duration": "pēc izvēles",
      "materials": "nav",
      "desc_lv": "Katram teikumam jāsākas ar vārdiem \"Jā, un...\". Saruna šādā veidā turpinās tik ilgi, cik vēlaties. Piemēram: \"Es gribētu doties kaut kur, kur ir silts.\" \"Jā, un Puertoriko varētu būt jauka vieta.\" \"Jā, un es ceru, ka kāds no mums prot spāņu valodu.\" \"Jā, un vajadzības gadījumā mēs varētu paņemt līdzi vārdnīcu.\"",
      "desc_ru": "Каждая фраза должна начинаться со слов «Да, и...». Диалог продолжается в таком ключе столько времени, сколько вам нужно. Например: «Я хочу поехать туда, где тепло». «Да, и Пуэрто-Рико — отличный вариант». «Да, и надеюсь, кто-нибудь из нас говорит по-испански». «Да, и мы могли бы взять с собой словарь, если понадобится»."
    },
    {
      "title": "Consultants / Консультанты",
      "people": "Jebkurš (ieteicami vismaz 6 dalībnieki)",
      "duration": "5–15 minūtes",
      "materials": "Papīrs un rakstamais katram dalībniekam.",
      "desc_lv": "Katrs dalībnieks uz papīra lapas augšdaļas uzraksta vienu problēmu vai jautājumu, ar ko viņš šobrīd saskaras. Atvēliet grupai 2 minūtes šim uzdevumam. Aiciniet visus nodot savas lapas blakus sēdošajam dalībniekam pa kreisi. Katram dalībniekam ir 1 minūte laika, lai izlasītu priekšā esošo problēmu un uzrakstītu kādu padomu. Atkal nododiet lapas tālāk un atkārtojiet procesu tik reižu, cik ļauj laiks. Atgrieziet lapas to sākotnējiem īpašniekiem. Piemēram: Problēma: Man ir grūtības uzturēt acu kontaktu, sniedzot negatīvu atgriezenisko saiti. Risinājumi: Pamēģiniet trenēties spoguļa priekšā. Pārliecinieties, ka atgriezeniskā saite nav uzbrūkoša un neliek cilvēkam ieņemt aizsargājošu pozīciju; tad varbūt tas nebūs tik grūti. Izspēlējiet situāciju lomās kopā ar draugu. Atcerieties – iespējams, tas nav tik negatīvi, kā jūs baidāties! Pavērojiet, cik viegli to dara Jolīna – viņa ir īsta profesionāle!",
      "desc_ru": "Каждый участник пишет в верхней части листа бумаги одну проблему или вопрос, которые его сейчас волнуют. На это задание отводится 2 минуты. Затем участники передают свои листы соседу слева. У каждого есть 1 минута, чтобы прочесть полученную проблему и написать совет. Листы передаются дальше по кругу; цикл повторяется столько раз, сколько позволяет время. В конце листы возвращаются их владельцам. Пример... Проблема: мне трудно поддерживать зрительный контакт, когда приходится высказывать критические замечания. Решения: попробуй потренироваться перед зеркалом. Следи за тем, чтобы твои слова не звучали как нападки и не заставляли собеседника занимать оборонительную позицию — тогда, возможно, будет легче. Разыграй ситуацию с другом. Помни: всё может оказаться не так уж плохо, как ты опасаешься! Посмотри, как легко это делает Джолин — она настоящий профи!"
    }
  ]
};

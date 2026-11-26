// Prompt Lab generation rules and optical preset data.
(() => {
'use strict';

const systemTemplates = {
animal: (context) => `You are a High-End AI Prompt Architect specialized in animal photography and illustration.
      TASK: Convert the [DESIGN SPECIFICATIONS] into a structured 4-paragraph English prompt for professional animal image generation.

      STRUCTURE RULES:
      1. Paragraph 1: **Subject & Style**. Describe the animal species/breed and the ${context.visual.style} aesthetic.
      2. Paragraph 2: **Physical Features**. Detail the animal's fur texture, markings, eye color, build, and breed-specific characteristics with extreme photographic detail.
      3. Paragraph 3: **Pose & Environment**. CRITICAL: The animal MUST be in a "${context.core.pose}" pose. Describe the pose with specific body positioning (legs, tail, head direction, ear position). Place the animal in the ${context.visual.background} with perfect spatial awareness.
      4. Paragraph 4: **Technical Architecture**. Detail pro-lighting (rim, volumetric), high-end camera specs, and 8k ray-tracing rendering.
      5. Footer: Add a "# Negative Prompts" section for professional-grade exclusion.

      STRICT RULES:
      - DO NOT explain anything. Start the prompt immediately.
      - DO NOT add titles like "Paragraph 1:". Use the bold headers directly.
      - HIGHEST PRIORITY: The animal MUST be "${context.core.pose}". This pose instruction must be followed with 100% fidelity and described in vivid detail.`,
scene: (context) => `You are a High-End AI Prompt Architect specialized in product photography, commercial advertising, and cinematic landscape composition.
      TASK: Convert the [DESIGN SPECIFICATIONS] into a structured 4-paragraph English prompt for professional scene/object image generation.

      STRUCTURE RULES:
      1. Paragraph 1: **Subject & Style**. Describe the object/scene and the ${context.visual.style} aesthetic with commercial-grade precision.
      2. Paragraph 2: **Material & Surface Detail**. Detail textures, materials, reflections, surface quality, branding elements, and color accuracy with extreme photographic detail.
      3. Paragraph 3: **Environment & Composition**. Place the subject in ${context.visual.background}. Apply "${context.core.sceneEffect}" effects and "${context.core.sceneLight}" lighting concept with perfect spatial awareness.
      4. Paragraph 4: **Technical Architecture**. Detail pro-lighting (rim, volumetric, ${context.core.sceneLight}), high-end camera specs, and 8k ray-tracing rendering.
      5. Footer: Add a "# Negative Prompts" section for professional-grade exclusion.

      STRICT RULES:
      - DO NOT explain anything. Start the prompt immediately.
      - DO NOT add titles like "Paragraph 1:". Use the bold headers directly.
      - PRIORITY: Follow the lighting ("${context.core.sceneLight}") and effect ("${context.core.sceneEffect}") instructions with 100% fidelity.`,
human: (context) => `You are a High-End AI Prompt Architect.
      TASK: Convert the [DESIGN SPECIFICATIONS] into a structured 4-paragraph English prompt for professional image generation.

      STRUCTURE RULES:
      1. Paragraph 1: **Identity & Style**. Focus on the subject and the ${context.visual.style} aesthetic.
      2. Paragraph 2: **Physical Attributes**. Describe facial features, skin texture, and identity with extreme cinematic detail.
      3. Paragraph 3: **Pose & Context**. Detail the ${context.core.pose} and the ${context.visual.background} with perfect spatial awareness.
      4. Paragraph 4: **Technical Architecture**. Detail pro-lighting (rim, volumetric), high-end camera specs, and 8k ray-tracing rendering.
      5. Footer: Add a "# Negative Prompts" section for professional-grade exclusion.

      STRICT RULES:
      - DO NOT explain anything. Start the prompt immediately.
      - DO NOT add titles like "Paragraph 1:". Use the bold headers directly.
      - PRIORITY: Follow the ${context.core.pose} instructions with 100% fidelity.`,
none: (context) => `You are a Universal Prompt Engineer.
      TASK: Convert the [DESIGN SPECIFICATIONS] into an English structured prompt for high-fidelity image generation.

      Since no specific category was selected, you must strictly preserve the literal intent of the user's input. Avoid adding abstract "luxury," "futuristic," or "sophisticated" flowery prose unless specifically requested by the user.

      STRUCTURE RULES:
      1. Paragraph 1: **Subject Formulation**. State the primary subject clearly based on the user's literal keywords. Define the core aesthetic (e.g., Flat, 3D, Minimalist, Sketch) derived ONLY from the intent.
      2. Paragraph 2: **Structural Features**. Describe the physical or graphic properties—shapes, line weights, color palette, and textures from the user's intent. Do not add complex lighting effects to simple 2D icons.
      3. Paragraph 3: **Contextual Layout**. Describe the positioning, background, and spatial arrangement. If the intent is an icon, keep the background clean (white/isolated) as typically expected for icons.
      4. Paragraph 4: **Technical Specification**. ADAPT based on the subject:
         - IF ICON/GUI: Use terms like "Vector quality," "Ultra-crisp edges," "Digital illustration," "Uniform line weight," "SVG style."
         - IF PHOTO/SCENE: Use "8k resolution," "Ray-tracing," "Photorealistic textures," "Cinema-grade lighting."
      5. Footer: Add a "# Negative Prompts" section.

      STRICT RULES:
      - DO NOT add abstract marketing fluff (Elegance, Innovation, High-tech) unless mentioned in the intent.
      - DO NOT explain anything. Start the prompt immediately.
      - PRIORITY: Maximum fidelity to the user's literal prompt while providing professional engineering depth.`,
fallback: (context) => `You are a High-End AI Prompt Architect. Provide a professional 4-paragraph prompt based on [DESIGN SPECIFICATIONS].`,
zimage: (context) => `You are a prompt engineer for Z-Image, a fast photorealistic text-to-image model.
Convert the [DESIGN SPECIFICATIONS] into ONE English prompt paragraph.

RULES:
- Plain text only. No markdown, no headers, no bullet points, no quotes.
- 60 to 140 words, and never more than 900 characters.
- Order: main subject and action -> appearance and outfit -> environment/background -> lighting -> camera (shot size, angle, lens feel) -> overall style/mood.
- Use concrete visual nouns and adjectives. Avoid empty buzzwords such as 8k, masterpiece, ultra-detailed, ray-tracing, award-winning.
- There is NO negative prompt field. Express every exclusion positively (e.g. "clean background" instead of "no clutter").
- Follow pose, shot, composition, camera angle and lighting specifications with full fidelity.
- VIEWING DIRECTION: if the horizontal camera angle is not a front view, state it in plain words in the first or second sentence (e.g. "seen from behind, facing away from the viewer", "in side profile", "from a three-quarter angle"). Never write degree numbers.
- Do not invent a location that the specifications do not give.
- CONCRETE OVER ABSTRACT: turn every abstract word into visible details — exact colors (e.g. "dusty pink and lavender"), specific garments and materials, a specific action with hands/gaze, specific props and setting objects.
- Put the main subject and its most important attributes in the first sentence.
- Where a specification says it is inferred/automatic, choose ONE simple, plausible option that fits the core intent instead of stacking many trendy details.
- Never mention cameras, tripods, lenses as objects, studio lights or other equipment as things visible in the image.
- Output only the prompt itself, nothing else.`
};

const BACKGROUND_REGISTRY = {
  'han-river': "Han River park in Seoul at sunset, riverside grass and city bridges glowing in warm light.",
  'seongsu-alley': "A trendy Seongsu-dong alley in Seoul with red-brick cafes and warm street lights.",
  'hanok': "A traditional Korean hanok courtyard with wooden beams and tiled roofs.",
  'cherry-blossom': "A street lined with blooming cherry blossom trees, soft pink petals.",
  'rooftop-night': "A city rooftop at night with glittering skyline lights in the background.",
  'subway': "A clean modern subway platform with soft fluorescent light.",
  'office': "A bright modern office with desks, plants and large windows.",
  'convenience-store': "In front of a Korean convenience store at night, glowing storefront light.",
  'home-kitchen': "A cozy home kitchen with warm light and simple wooden cabinets.",
  'bedroom': "A cozy bedroom with white bedding and morning sunlight through sheer curtains.",
  'beach-sunset': "A calm beach at sunset with soft waves and an orange sky.",
  'snowy-street': "A quiet street with gently falling snow and warm shop lights.",
  'library': "A quiet bookstore or library with tall wooden bookshelves.",
  'gym': "A modern gym with equipment softly blurred in the background.",
  'white-seamless': "A plain seamless pure-white background, evenly lit, no props.",
  'pastel-backdrop': "A plain seamless pastel-colored backdrop, evenly lit, no props.",
  'snowy-field': "A snow-covered open field with soft winter light.",
  'beach-dog': "A sandy beach with gentle waves.",
  'sofa-blanket': "A soft sofa with a cozy knitted blanket in a warm living room.",
  'flower-garden': "A colorful flower garden in soft daylight.",
  'autumn-leaves': "A path covered in red and orange autumn leaves.",
  'pet-cafe': "A bright pet cafe with wooden floors and toys.",
  'white-backdrop': "A plain seamless pure-white background, evenly lit.",
  'white-desk-sun': "A clean white desk with warm sunlight streaming from a window and soft shadows.",
  'marble-vanity': "A white marble vanity countertop with a softly blurred mirror behind.",
  'kitchen-counter': "A clean kitchen counter with natural light.",
  'bathroom-shelf': "A minimal bathroom shelf with soft tiles and natural light.",
  'cafe-wood-table': "A warm wooden cafe table with soft window light.",
  'picnic': "A picnic blanket on green grass in sunlight.",
  'water-surface': "A calm water surface with gentle reflections.",
  'stone-podium': "A minimal natural stone podium with a soft seamless background.",
  'gradient-studio': "A smooth color-gradient studio background.",
  'hanok-interior': "A traditional Korean hanok interior with hanji paper doors and wooden floor.",
  'night-city-window': "A window ledge overlooking a glittering night city.",

  'life4cut': (poses) => `A 2x2 grid collage (4-split photo booth style). Background: A clean, minimalist studio with a solid, soft pastel-colored background (e.g., muted pink, blue, or lavender) to keep the focus on the subject. Each of the four panels MUST show a different unique pose: Panel 1: ${poses[0]}; Panel 2: ${poses[1]}; Panel 3: ${poses[2]}; Panel 4: ${poses[3]}. Upper-body centric. High-quality Photo Booth aesthetic.`,
  'living-room': 'A cozy, modern indoor living room or room with natural soft lighting and elegant interior details.',
  'mountain-stars': 'A breathtaking vast mountain range at night under a brilliant galaxy of stars, with soft celestial glow and deep cinematic depth.',
  'empty-beach': 'A serene and empty tropical beach with gentle waves, soft white sand, and a clear horizontal view, evoking solitude and peace.',
  'vast-nature': 'A broad, expansive natural landscape with rolling hills, distant forests, and epic lighting, capturing the scale of the wilderness.',
  'cosmetic-studio': 'A high-end, luxury cosmetic advertising studio. Focus on the subject placed on a clean marble or glass pedestal, surrounded by soft ripples of water, elegant refractive lighting, and a minimalist pastel silk backdrop. Professional product photography.',
  'green-chroma': "A flat, evenly lit chroma-key green screen background (pure #00B140 green), no shadows or wrinkles on the backdrop, clean edges around the subject for easy keying, no green spill on the subject.",
  'blue-chroma': "A flat, evenly lit chroma-key blue screen background (pure #0047BB blue), no shadows on the backdrop, clean subject edges for easy keying.",
  'black-seamless': "A plain seamless deep-black background, subject isolated with no visible backdrop texture.",
  'gray-seamless': "A plain seamless mid-gray studio backdrop, evenly lit, no props.",
  'beige-seamless': "A plain seamless warm beige backdrop, soft and evenly lit, no props.",
  'sky-blue-seamless': "A plain seamless soft sky-blue backdrop, evenly lit, no props.",
  'color-block': "A bold two-tone color-block backdrop with clean geometric shapes, pop editorial look.",
  'paper-texture': "A plain off-white textured paper backdrop with subtle fibers.",
  'concrete-wall': "A smooth raw exposed-concrete wall as a minimal backdrop.",
  'brick-wall': "A red brick wall as a casual backdrop.",
  'bokeh-lights': "A dark background filled with soft out-of-focus bokeh light circles.",
  'idol-stage': "A K-pop concert stage with colorful stage lights, LED screens and haze.",
  'photo-studio-backdrop': "A Korean profile-photo studio with a clean mottled gray canvas backdrop.",
  'hair-salon': "A bright modern hair salon with mirrors and styling chairs.",
  'department-store': "An elegant department store floor with polished displays and warm lighting.",
  'airport': "A bright airport departure hall with large windows and departure boards.",
  'airplane-window': "An airplane window seat with soft daylight and clouds outside.",
  'train-window': "A train seat by the window with countryside scenery passing outside.",
  'car-interior': "Inside a modern car, driver or passenger seat, daylight through the windows.",
  'bus-stop': "A Korean city bus stop shelter with street traffic in the background.",
  'crosswalk': "A busy downtown crosswalk with city buildings.",
  'gangnam-street': "A wide Gangnam boulevard with glass office towers.",
  'myeongdong': "The bustling Myeongdong shopping street with shop signs.",
  'hongdae': "A lively Hongdae street with murals, small shops and young crowds.",
  'traditional-market': "A lively Korean traditional market with food stalls and hanging lights.",
  'pojangmacha': "Inside an orange-tented Korean street food bar (pojangmacha) at night.",
  'korean-bbq': "A Korean BBQ restaurant table with a grill and side dishes.",
  'bakery': "A cozy bakery with bread on wooden shelves and warm light.",
  'bar-lounge': "A dim upscale cocktail bar with backlit bottles.",
  'fine-dining': "An elegant fine-dining restaurant with white tablecloths and soft candlelight.",
  'museum-gallery': "A minimalist white art gallery with framed works on the walls.",
  'classroom': "A Korean school classroom with desks, a blackboard and windows.",
  'university-campus': "A green university campus with old stone buildings.",
  'hospital': "A clean bright medical clinic room.",
  'hotel-room': "A luxurious hotel room with crisp white bedding and city view.",
  'hotel-lobby': "A grand hotel lobby with marble floors and chandeliers.",
  'pool-side': "A sunny resort poolside with loungers and turquoise water.",
  'tropical-resort': "A tropical resort with palm trees and white sand.",
  'jeju-coast': "The Jeju Island coastline with black volcanic rocks and blue sea.",
  'mountain-peak': "A mountain summit overlooking layered ridges and clouds.",
  'camping': "A campsite with a tent, camping chairs and a small fire at dusk.",
  'forest-path': "A sunlit forest path with tall trees.",
  'flower-field': "A wide field of yellow rapeseed flowers under a blue sky.",
  'autumn-park': "A park full of red and yellow autumn leaves.",
  'rainy-street': "A rainy city street with reflections on wet pavement and umbrellas.",
  'night-market-neon': "A night market with string lights and food stalls.",
  'amusement-park': "An amusement park with a carousel and colorful lights.",
  'basketball-court': "An outdoor basketball court with a chain-link fence.",
  'running-track': "A red running track in a stadium.",
  'yoga-studio': "A calm yoga studio with wooden floor and plants.",
  'recording-studio': "A music recording studio with a microphone and acoustic panels.",
  'home-office': "A tidy home office desk with a laptop, lamp and bookshelf.",
  'livingroom-sofa': "A cozy living room with a sofa and soft daylight.",
  'wedding-hall': "An elegant wedding hall with white flowers and soft lighting.",
  'church-chapel': "A quiet chapel with wooden pews and stained-glass light.",
  'palace': "Gyeongbokgung palace with traditional Korean architecture.",
  'vintage-80s-room': "A 1980s retro room with wood paneling and vintage furniture.",
  'y2k-room': "A Y2K-style room with translucent gadgets, pastel colors and posters without text.",
  'dog-park': "A fenced grassy dog park on a sunny day.",
  'vet-clinic': "A clean bright veterinary clinic room.",
  'grooming-salon': "A pet grooming salon with a grooming table.",
  'cat-tower': "A carpeted cat tower beside a sunny window.",
  'windowsill-sun': "A sunny windowsill with soft curtains.",
  'bed-duvet': "A soft white duvet on a bed in morning light.",
  'kitchen-floor': "A clean kitchen floor near the counter.",
  'car-seat-pet': "The back seat of a car with a window view.",
  'camping-pet': "A campsite with a tent and camping chairs.",
  'river-side': "A riverside walking path with grass and trees.",
  'city-sidewalk': "A clean city sidewalk with shop fronts.",
  'pet-cafe-play': "A colorful soft play mat with toys.",
  'pumpkin-patch': "A pumpkin patch in autumn.",
  'christmas-tree': "Next to a decorated Christmas tree with warm fairy lights.",
  'birthday-party': "A birthday party setup with balloons and a small cake.",
  'aquarium-wall': "In front of a large blue aquarium tank.",
  'farm-barn': "A rustic farm barn with hay bales.",
  'lake-dock': "A wooden lake dock in calm morning light.",
  'desert-dune': "Golden sand dunes under a clear sky.",
  'mountain-trail': "A rocky mountain trail with a valley view.",
  'bathroom-tile': "A clean bathroom with white tiles and soft daylight.",
  'vanity-mirror': "A vanity table in front of a round mirror with soft light.",
  'bed-linen': "Rumpled white linen bedding in morning light.",
  'terrazzo': "A terrazzo stone surface with colorful chips.",
  'wood-shelf': "A light oak wooden shelf against a plain wall.",
  'glass-shelf': "A glass shelf with soft reflections.",
  'acrylic-blocks': "Clear acrylic blocks and geometric shapes on a pastel surface.",
  'silk-fabric': "Flowing satin silk fabric draped softly around the product.",
  'sand-beach-product': "Fine beach sand with gentle ripples and shadows.",
  'pebbles': "Smooth river pebbles arranged around the product.",
  'moss-forest': "Green moss and small ferns on a forest floor.",
  'flowers-around': "Fresh flowers and petals arranged around the product.",
  'fruit-splash': "Fresh sliced fruit and water droplets splashing around the product.",
  'ice-cubes': "Clear ice cubes and frost with cold condensation.",
  'snow-surface': "A clean fresh snow surface.",
  'smoke-dark': "A dark background with soft drifting smoke.",
  'neon-sign-wall': "A dark wall with glowing abstract neon tubes (no letters).",
  'mirror-reflection': "A glossy mirror-like surface reflecting the product.",
  'cylinder-podium': "A minimalist cylinder podium with soft shadows and a pastel wall.",
  'arch-podium': "A minimalist arch backdrop with a round podium.",
  'tech-desk': "A clean desk setup with a keyboard, monitor glow and cables tidy.",
  'gaming-rgb': "A dark gaming desk with RGB lighting.",
  'cafe-counter': "A cafe counter with an espresso machine in the background.",
  'dining-table': "A dining table set with plates and linen napkins.",
  'bbq-table': "An outdoor BBQ table with grill smoke in the background.",
  'picnic-blanket': "A checkered picnic blanket on grass.",
  'gym-floor': "A rubber gym floor with dumbbells nearby.",
  'car-dashboard': "A car dashboard with the road visible ahead.",
  'office-desk': "A tidy office desk with documents and a laptop.",
  'kids-room': "A bright kids room with soft toys.",
  'christmas-scene': "A cozy Christmas setting with pine branches and warm fairy lights.",
  'autumn-leaves-table': "A wooden table with scattered autumn leaves.",
  'spring-blossom': "Cherry blossom branches with soft pink petals.",
  'summer-pool': "Turquoise pool water with caustic light patterns.",
  'rooftop-city': "A rooftop ledge with a city skyline behind.",
  'street-night': "A wet city street at night with colorful reflections.",
  'forest-mist': "A misty pine forest at dawn.",
  'waterfall': "A lush waterfall with spray and green rocks.",
  'aurora': "A snowy landscape under a green aurora sky.",
  'underwater': "An underwater scene with light rays and bubbles.",
  'cloud-sky': "Soft white clouds in a bright blue sky.",
  'abstract-gradient': "A smooth abstract color gradient with soft shapes.",
  'neon-street': "A city street at night glowing with colorful neon signs (no readable text) reflecting on wet pavement.",
  'cozy-cafe': "A cozy cafe interior with warm wood, plants and soft window light.",
  'minimal-studio': "A minimalist photo studio with a plain light backdrop and soft even light.",
  'cyber-penthouse': "A futuristic penthouse at night with floor-to-ceiling windows over a neon city.",
  'rainy-window': "Beside a window with raindrops on the glass and soft gray daylight.",
  'sunny-park': "A sunny park lawn with trees and soft dappled light.",
  'cozy-livingroom': "A cozy living room with a rug, sofa and warm afternoon light.",
  'forest-trail': "A lush forest trail with tall trees and sunbeams.",
  'pet-hotel': "A luxurious pet hotel room with a plush bed and elegant decor.",
  'green-meadow': "A wide green meadow under a clear blue sky.",
  'rainy-yard': "A backyard on a rainy day with wet grass and puddles.",
  'cyber-city': "A futuristic megacity of glowing skyscrapers at night.",
  'deep-space': "Deep space with stars, nebulae and distant galaxies.",
  'surreal-desert': "A surreal desert with smooth dunes and dreamlike pastel sky.",
  'floating-island': "A floating island above the clouds with waterfalls pouring off its edges."
};

const boothPoses = [
  'making a cute V-sign with fingers',
  'a bright warm smile',
  'playfully sticking out the tongue',
  'winking at the camera',
  'making a small finger heart',
  'puffing out cheeks cutely',
  'poking one cheek with a finger',
  'looking surprised with hands on cheeks',
  'a shy and candid laugh',
  'blowing a heart-shaped kiss',
  'pouting with a grumpy yet cute face',
  'looking upwards dreamily'
];

const LIGHT_PRESETS = {
  'auto': { optionLabel: "Auto (장면에 맞게)", label: 'Auto' },
  'natural': { optionLabel: "Natural Light · 자연광", label: 'Natural Light', azimuth: 30, elevation: 25, intensity: 55, distance: 3, source: 'sunlight', quality: 'soft', tonalStyle: 'balanced', fillLight: 'medium', colorTemperatureK: 5600 },
  'soft': { optionLabel: "Soft Light · 부드러운 빛", label: 'Soft Light', azimuth: 35, elevation: 30, intensity: 50, distance: 1.5, source: 'led', quality: 'soft', tonalStyle: 'balanced', fillLight: 'medium', colorTemperatureK: 5000 },
  'hard': { optionLabel: "Hard Light · 강한 빛", label: 'Hard Light', azimuth: 45, elevation: 35, intensity: 80, distance: 2.5, source: 'strobe', quality: 'hard', tonalStyle: 'high-contrast', fillLight: 'low', colorTemperatureK: 5500 },
  'direct-flash': { optionLabel: "Direct Flash · 정면 플래시", label: 'Direct Flash', azimuth: 0, elevation: 5, intensity: 90, distance: 1, source: 'strobe', quality: 'hard', tonalStyle: 'high-contrast', fillLight: 'off', colorTemperatureK: 5500 },
  'rim': { optionLabel: "Rim Lighting · 림 라이트", label: 'Rim Lighting', azimuth: 160, elevation: 20, intensity: 75, distance: 2, source: 'led', quality: 'hard', tonalStyle: 'low-key', fillLight: 'low', colorTemperatureK: 6000 },
  'rembrandt': { optionLabel: "Rembrandt · 렘브란트", label: 'Rembrandt', azimuth: 315, elevation: 40, intensity: 70, distance: 1.5, source: 'led', quality: 'soft', tonalStyle: 'low-key', fillLight: 'low', colorTemperatureK: 4500 },
  'butterfly': { optionLabel: "Butterfly · 버터플라이", label: 'Butterfly', azimuth: 0, elevation: 50, intensity: 65, distance: 1.5, source: 'strobe', quality: 'soft', tonalStyle: 'balanced', fillLight: 'medium', colorTemperatureK: 5500 },
  'split': { optionLabel: "Split · 스플릿", label: 'Split', azimuth: 270, elevation: 0, intensity: 75, distance: 1.2, source: 'led', quality: 'hard', tonalStyle: 'low-key', fillLight: 'off', colorTemperatureK: 5000 },
  'loop': { optionLabel: "Loop · 루프", label: 'Loop', azimuth: 330, elevation: 30, intensity: 65, distance: 1.5, source: 'led', quality: 'soft', tonalStyle: 'balanced', fillLight: 'medium', colorTemperatureK: 5200 },
  'neon': { optionLabel: "Neon · 네온", label: 'Neon', azimuth: 100, elevation: 10, intensity: 70, distance: 1, source: 'led', quality: 'soft', tonalStyle: 'low-key', fillLight: 'low', colorTemperatureK: 8000 },
  'golden-hour': { optionLabel: "Golden Hour · 골든아워", label: 'Golden Hour', azimuth: 250, elevation: 8, intensity: 60, distance: 10, source: 'sunlight', quality: 'soft', tonalStyle: 'balanced', fillLight: 'low', colorTemperatureK: 3200 },
  'ambient': { optionLabel: "Ambient · 주변광", label: 'Ambient', azimuth: 0, elevation: 45, intensity: 35, distance: 5, source: 'auto', quality: 'soft', tonalStyle: 'low-contrast', fillLight: 'high', colorTemperatureK: 'auto' },
  'studio': { optionLabel: "Studio · 스튜디오", label: 'Studio', azimuth: 30, elevation: 35, intensity: 70, distance: 2, source: 'strobe', quality: 'soft', tonalStyle: 'balanced', fillLight: 'medium', colorTemperatureK: 5500 },
  'custom': { optionLabel: "Custom · 직접 설정", label: 'Custom' }
};
const PRESET_FIELDS = ['azimuth', 'elevation', 'intensity', 'distance', 'source', 'quality', 'tonalStyle', 'fillLight', 'colorTemperatureK'];

const SOURCE_TEXT = { sunlight: 'sunlight', led: 'LED panel', fluorescent: 'fluorescent tube', tungsten: 'tungsten lamp', strobe: 'studio strobe' };
const TONAL_TEXT = { balanced: 'balanced tonal range', 'high-key': 'bright high-key tones', 'low-key': 'dark low-key tones', 'high-contrast': 'high contrast', 'low-contrast': 'low contrast, flat tones' };
const FILL_TEXT = { off: 'no fill light, deep shadows', low: 'low fill light', medium: 'moderate fill light', high: 'strong fill light, open shadows' };
const VOL_TYPE_TEXT = { haze: 'haze', fog: 'fog', dust: 'floating dust particles', smoke: 'smoke' };

const CAMERA_TYPES = { auto: 'Auto', smartphone: 'Smartphone', 'ccd-compact': 'CCD Compact', dslr: 'DSLR', mirrorless: 'Mirrorless', cinema: 'Cinema', 'film-35mm': '35mm Film', 'medium-format': 'Medium Format' };
const CAMERA_TEXT = { smartphone: 'a smartphone main camera', 'ccd-compact': 'an early-2000s CCD compact digital camera', dslr: 'a DSLR', mirrorless: 'a full-frame mirrorless camera', cinema: 'a digital cinema camera', 'film-35mm': '35mm film', 'medium-format': 'a medium format camera' };
const FOCALS = ['14', '24', '28', '35', '50', '85', '105', '135', '200'];
const APERTURES = ['1.2', '1.4', '1.8', '2', '2.8', '4', '5.6', '8', '11', '16'];
const LENS_PRESETS = {
  'auto': { optionLabel: "Auto", label: 'Auto' },
  'canon-r5ii-rf50': { optionLabel: "Canon EOS R5 Mark II + RF 50mm F1.8 STM", label: 'Canon EOS R5 Mark II + RF 50mm F1.8 STM', text: 'Canon EOS R5 Mark II with an RF 50mm F1.8 STM lens', cameraType: 'mirrorless', focal: '50', aperture: '1.8', maxAperture: 1.8, fixedFocal: '50' },
  'sony-a7iv-fe85': { optionLabel: "Sony A7 IV + FE 85mm F1.8", label: 'Sony A7 IV + FE 85mm F1.8', text: 'Sony A7 IV with an FE 85mm F1.8 lens', cameraType: 'mirrorless', focal: '85', aperture: '1.8', maxAperture: 1.8, fixedFocal: '85' },
  'fuji-x100vi': { optionLabel: "Fujifilm X100VI (23mm ≈ 35mm 환산)", label: 'Fujifilm X100VI (23mm ≈ 35mm 환산)', text: 'Fujifilm X100VI (23mm lens, about 35mm full-frame equivalent)', cameraType: 'mirrorless', focal: '35', aperture: '2', maxAperture: 2, fixedFocal: '35' },
  'smartphone-main': { optionLabel: "Smartphone Main Camera", label: 'Smartphone Main Camera', text: 'a smartphone main camera', cameraType: 'smartphone', focal: '24', aperture: '1.8', maxAperture: 1.8, fixedFocal: '24' },
  'vintage-ccd': { optionLabel: "Vintage CCD Compact", label: 'Vintage CCD Compact', text: 'a vintage early-2000s CCD compact camera', cameraType: 'ccd-compact', focal: '35', aperture: '2.8', maxAperture: 2.8 },
  'custom': { optionLabel: "Custom · 직접 설정", label: 'Custom' }
};

const DEFAULT_LIGHTING = () => ({
  enabled: true, preset: 'auto', originPreset: null,
  azimuth: 45, elevation: 30, intensity: 60, distance: 2,
  source: 'auto', quality: 'auto', shadowHardness: 50, tonalStyle: 'auto', fillLight: 'auto', colorTemperatureK: 'auto',
  volumetric: { enabled: false, type: 'haze', density: 30, visibility: 'subtle' }
});
const DEFAULT_OPTICS = () => ({ lensPreset: 'auto', originPreset: null, cameraType: 'auto', focal: 'auto', aperture: 'auto', whiteBalanceK: 'auto' });

const presetOptions = presets => Object.entries(presets).map(([id, preset]) => [id, preset.optionLabel || preset.label]);
const opticsFields = {
  'lt-preset': { default: 'auto', options: presetOptions(LIGHT_PRESETS) },
  'op-lens': { default: 'auto', options: presetOptions(LENS_PRESETS) },
  "lt-vol-type": { default: "haze", options: [["haze", "Haze · 연무"], ["fog", "Fog · 안개"], ["dust", "Dust · 먼지"], ["smoke", "Smoke · 연기"]] },
  "lt-vol-visibility": { default: "subtle", options: [["subtle", "Subtle · 은은"], ["moderate", "Moderate · 보통"], ["strong", "Strong · 강함"]] },
  "lt-source": { default: "auto", options: [["auto", "Auto"], ["sunlight", "Sunlight · 태양광"], ["led", "LED"], ["fluorescent", "Fluorescent · 형광등"], ["tungsten", "Tungsten · 텅스텐"], ["strobe", "Strobe · 스트로보"]] },
  "lt-quality": { default: "auto", options: [["auto", "Auto"], ["soft", "Soft · 부드럽게"], ["hard", "Hard · 선명하게"], ["custom", "Custom · 그림자 경도"]] },
  "lt-tonal": { default: "auto", options: [["auto", "Auto"], ["balanced", "Balanced"], ["high-key", "High Key"], ["low-key", "Low Key"], ["high-contrast", "High Contrast"], ["low-contrast", "Low Contrast"]] },
  "lt-fill": { default: "auto", options: [["auto", "Auto"], ["off", "Off"], ["low", "Low"], ["medium", "Medium"], ["high", "High"]] },
  "op-camera": { default: "auto", options: [["auto", "Auto"], ["smartphone", "Smartphone"], ["ccd-compact", "CCD Compact"], ["dslr", "DSLR"], ["mirrorless", "Mirrorless"], ["cinema", "Cinema"], ["film-35mm", "35mm Film"], ["medium-format", "Medium Format"]] },
  "op-focal": { default: "auto", options: [["auto", "Auto"], ["14", "14mm"], ["24", "24mm"], ["28", "28mm"], ["35", "35mm"], ["50", "50mm"], ["85", "85mm"], ["105", "105mm"], ["135", "135mm"], ["200", "200mm"]] },
  "op-aperture": { default: "auto", options: [["auto", "Auto"], ["1.2", "f/1.2"], ["1.4", "f/1.4"], ["1.8", "f/1.8"], ["2", "f/2"], ["2.8", "f/2.8"], ["4", "f/4"], ["5.6", "f/5.6"], ["8", "f/8"], ["11", "f/11"], ["16", "f/16"]] },
};

function systemPrompt(subject, mode, context) {
  const key = mode === 'zimage' ? 'zimage' : subject;
  return (Object.hasOwn(systemTemplates, key) ? systemTemplates[key] : systemTemplates.fallback)(context);
}

function background(value, poses) {
  const entry = Object.hasOwn(BACKGROUND_REGISTRY, value) ? BACKGROUND_REGISTRY[value] : undefined;
  if (typeof entry === 'function') return entry(poses);
  return entry ?? (value && value !== 'none' ? value : "If the core intent names or clearly implies a place, use exactly that place. Otherwise use a simple, uncluttered neutral background (soft plain tone or gentle blur). Do NOT invent a specific location (no cafe, kitchen, street, etc. unless the intent says so) and no visible studio equipment.");
}

function perspective(pov, description) {
  return pov === 'arm-extended'
      ? 'Mode: First-Person Selfie. It looks like a photo taken with an outstretched arm. Intimate connection.'
      : pov === 'selfie'
        ? 'Mode: Mirror Selfie or Handheld Selfie. The subject is holding a smartphone or camera visibly in the frame, taking a picture (e.g., looking into a mirror).'
        : `Mode: Standard third-person view${pov && pov !== 'standard' ? ` (${description})` : ''}. Not a selfie: no arms reaching toward the lens. Do not describe cameras, tripods, lights or any filming equipment.`;
}

function imageConstraints(pov) {
  const hint = pov === 'arm-extended'
        ? 'No phone or camera visible in frame; anatomically correct arms and hands.'
        : pov === 'selfie'
          ? 'Exactly two natural arms, one phone, natural fingers.'
          : 'Natural anatomy and realistic hands.';
  return hint + ' Clothing and props without printed text or logos (plain or simple patterns).';
}

const selfieExclusions = {
  "arm-extended": "- Smartphone, Camera, Hand holding device, Mobile phone, Selfie stick, monopod, extra hands, multiple arms, floating limbs, disconnected arms, weird fingers, deformed arm, long arm, deformed phone, holding two phones",
  "selfie": "- extra hands, multiple arms, floating limbs, disconnected arms, weird fingers, deformed arm, long arm, holding two phones"
};

function negativePrompt(pov, mode) {
  return mode !== 'zimage' && Object.hasOwn(selfieExclusions, pov) ? selfieExclusions[pov] : '';
}

const outfitInstructions = {
  "reference": "STRICT OUTFIT TRANSFERS: Perfectly replicate the garment from the reference image. Maintain identical color, fabric texture, cut, and specific clothing patterns. Do not add or subtract any clothing elements.",
  "none": "Outfit that naturally fits the subject, setting and mood described in the core intent (do not force a fashion style)"
};
const poseInstructions = {
  "relaxed": "Relaxed candid everyday moment, natural unposed body language, as if caught mid-action",
  "t-pose": "STRICT TECHNICAL T-POSE: Arms fully extended horizontally to the sides at 90 degrees from the torso, palms down or forward, standing perfectly upright, legs straight together, facing front, symmetrical, character sheet orthographic style.",
  "a-pose": "STRICT TECHNICAL A-POSE: Standing with a significant gap between the legs, feet spread wide to shoulder-width apart to form a literal \"A\" shape with the entire body. Legs must NOT touch. Arms extended downwards at a 45-degree angle away from the body, standing perfectly upright, facing front, symmetrical, character sheet orthographic reference style.",
  "arm-extended": "SELFIE PERSPECTIVE: POV selfie style, the subject is holding the camera with one arm visibly extended out of the frame towards the lens, forearm reaching towards the camera, wide angle lens effect, perspective from a handheld camera in hand, close-up intimacy."
};

const outfit = value => Object.hasOwn(outfitInstructions, value) ? outfitInstructions[value] : value;
const pose = value => Object.hasOwn(poseInstructions, value) ? poseInstructions[value] : value;
const humanIdentity = value => {
  if (value === 'strict') return 'STRICTLY MAINTAIN the face and unique identity of the reference human.';
  if (value === 'selective') return 'Focus on key facial features and vibe from reference, but allow minor variations.';
  return 'Generate a completely new and independent character identity.';
};
const objectIntegrity = value => value === 'strict'
  ? 'STRICTLY PRESERVE the exact geometry, branding, and structural details of the reference object. Do not allow any structural hallucinations or modifications.'
  : 'Allow for artistic reinterpretation and creative structural/stylistic changes to the reference object.';

function opticsInstruction(keys, mode) {
  return `\n\nLIGHTING & OPTICS: The [LIGHTING & OPTICS CONSTRAINTS] block is authoritative. Describe that light direction (camera-frame left/right/front/back), height, intensity, quality, color temperature, atmosphere and the camera/lens look exactly as given, and keep these exact terms: ${keys.join(', ')}. They describe the photographic look, not objects visible in the image.${mode === 'zimage' ? '' : ' Put them in the technical paragraph.'}`;
}

function artDirection(mood, palette) {
  const lines = [];
  if (mood && mood !== 'none') lines.push(`- Mood: ${mood}.`);
  if (palette && palette !== 'none') {
    lines.push(`- Color palette: ${palette}. Use these colors for the environment and accents while preserving explicitly specified subject colors and reference details.`);
  }
  return lines.length ? `\n[ART DIRECTION]\n${lines.join('\n')}\n` : '';
}

const rules = {
  pose, outfit, humanIdentity, objectIntegrity, opticsInstruction, artDirection,
  systemPrompt, background, boothPoses, perspective, imageConstraints, negativePrompt, opticsFields,
  optics: {
    LIGHT_PRESETS, PRESET_FIELDS, SOURCE_TEXT, TONAL_TEXT, FILL_TEXT, VOL_TYPE_TEXT, CAMERA_TYPES, CAMERA_TEXT,
    FOCALS, APERTURES, LENS_PRESETS, DEFAULT_LIGHTING, DEFAULT_OPTICS
  }
};
if (typeof module !== 'undefined' && module.exports) module.exports = rules;
else globalThis.PromptRules = rules;
})();

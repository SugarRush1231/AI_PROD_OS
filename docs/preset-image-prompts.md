# 조명·카메라 프리셋 예시 이미지 프롬프트 (총 27장)

조명/카메라 패널에서 프리셋을 고르면 보여줄 **예시 사진**용입니다.
모든 사진이 **같은 피사체·같은 구도·같은 배경**이어야 조명 차이만 비교됩니다.
피사체는 **흰 석고 흉상**(사물)입니다. 사람처럼 얼굴이 바뀔 걱정이 없고, 렘브란트·버터플라이처럼 얼굴 그림자로 구분하는 조명도 잘 보이며, 사이트의 3D 회색 흉상 프리뷰와도 맞습니다.

## 만드는 순서 (ChatGPT)

1. **새 채팅**에서 아래 `0. 기준 사진` 프롬프트로 한 장을 만듭니다. 마음에 들 때까지 다시 만들어도 됩니다.
2. 기준 사진이 정해지면 **같은 채팅에서** 1번부터 차례로 붙여넣습니다.
   - 각 프롬프트는 "기준 사진에서 조명(또는 렌즈)만 바꿔라"라는 뜻이라, 흉상 모양이 바뀌지 않습니다.
   - 흉상 모양이나 각도가 바뀌면 기준 사진을 다시 첨부하고 같은 문장을 한 번 더 보내세요.
3. 정사각형(1:1)으로 받으면 됩니다. 크기 조정·WebP 변환은 제가 합니다.
4. 파일 이름을 아래 표의 **파일명**으로 바꿔서 주세요 (확장자는 png/jpg 상관없음).

---

## 0. 기준 사진 (base.png)

```
Photorealistic studio product photo, square 1:1. A matte white plaster sculpture bust of a generic young person (head, neck and shoulders, smooth classical features, closed calm expression, no specific real person), placed on a small matte white cylinder pedestal. The bust faces straight toward the camera. Centered framing from the top of the head to the pedestal top, eye level, shot on a 50mm lens. Plain seamless mid-gray studio backdrop. Soft, even, neutral studio lighting. Fine plaster texture visible, sharp focus. No text, no logos, no watermark.
```

---

## 조명 프리셋 13장 → `img/presets/lighting/`

각 문장 앞에 공통 문장을 붙여서 보냅니다:

> **Keep exactly the same white plaster bust, pedestal, pose, framing, camera angle and gray backdrop as the reference photo. Change ONLY the lighting:**

| # | 파일명 | 프롬프트 (공통 문장 뒤에 붙이기) |
|---|---|---|
| 1 | `natural.png` | Natural window daylight coming from the front-left of the frame, slightly above eye level, soft and airy, neutral 5600K daylight color, gentle shadows on the right side of the face. |
| 2 | `soft.png` | A large soft light source from the front-left of the frame, slightly above the eyes; very soft, wrapped light with smooth, barely visible shadow edges; moderate fill; clean and flattering. |
| 3 | `hard.png` | A single hard, small light source from the front-left of the frame at about 45 degrees and slightly above; crisp, sharp-edged shadows under the nose and chin; little fill; high contrast. |
| 4 | `direct-flash.png` | Direct on-camera flash from straight in front at eye level: flat bright frontal light, crisp shadow just behind the bust outline on the backdrop, slight specular shine on the plaster, snapshot party-photo look. |
| 5 | `rim.png` | Strong backlight from behind the bust, slightly to the right, creating a bright glowing rim of light along the head and shoulder edges; the face mostly in soft shadow; dark low-key mood. |
| 6 | `rembrandt.png` | Rembrandt lighting: one key light from the upper left of the frame at about 45 degrees, so the far cheek (frame-right) is in shadow except for a small bright inverted triangle of light under the eye; low fill; moody low-key. |
| 7 | `butterfly.png` | Butterfly (paramount) lighting: key light straight in front and high above the face, creating a small butterfly-shaped shadow directly under the nose; even bright cheeks; soft fill from below. |
| 8 | `split.png` | Split lighting: a single light from directly at the left side of the frame at eye level, lighting exactly half of the face while the other half falls into deep shadow; no fill. |
| 9 | `loop.png` | Loop lighting: key light slightly to the left of the camera (about 30 degrees) and a little above eye level, creating a small soft loop-shaped nose shadow that does not touch the cheek shadow; moderate fill. |
| 10 | `neon.png` | Neon lighting: saturated magenta neon light from the right side of the frame and cyan neon light from the left, colorful glow on the white plaster surface, dark surroundings, night club mood. |
| 11 | `golden-hour.png` | Golden-hour sunlight: warm low sun (about 3200K) coming from the left side of the frame just above eye level, glowing orange tones on the plaster, long soft shadows, gentle warm haze. |
| 12 | `ambient.png` | Soft ambient light only: no visible key light direction, flat even illumination from all around like an overcast day, very low contrast, almost no shadows. |
| 13 | `studio.png` | Classic professional studio lighting: a softbox key light from the front-left above eye level, a fill light on the right, and a subtle back light from behind; clean, balanced commercial product look. |

---

## 렌즈 프리셋 5장 → `img/presets/lens/`

공통 문장:

> **Keep exactly the same white plaster bust, pedestal and gray backdrop as the reference photo with the same soft lighting. Change ONLY the camera and lens look:**

| # | 파일명 | 프롬프트 |
|---|---|---|
| 14 | `canon-r5ii-rf50.png` | Shot on a Canon EOS R5 Mark II with an RF 50mm F1.8 STM lens at f/1.8: natural perspective, shallow depth of field, creamy smooth background, crisp detail on the sculpted eyes. |
| 15 | `sony-a7iv-fe85.png` | Shot on a Sony A7 IV with an FE 85mm F1.8 lens at f/1.8: tighter framing from the shoulders up, flattering telephoto compression, very soft blurred background. |
| 16 | `fuji-x100vi.png` | Shot on a Fujifilm X100VI (23mm, about 35mm equivalent) at f/2: slightly wider framing showing more of the pedestal and backdrop, natural wide-normal perspective, subtle classic film-like color rendering. |
| 17 | `smartphone-main.png` | Shot on a smartphone main camera (24mm equivalent): wider framing, everything fairly sharp, slight wide-angle perspective, bright computational-HDR look typical of phone photos. |
| 18 | `vintage-ccd.png` | Shot on an early-2000s CCD compact digital camera (about 35mm equivalent, f/2.8): slightly harsh on-camera flash feel, punchy saturated colors, mild digital noise, nostalgic Y2K snapshot look. |

---

## 볼류메트릭(대기 효과) 4장 → `img/presets/volumetric/`

공통 문장:

> **Keep exactly the same white plaster bust, pedestal and framing as the reference photo. Keep a single key light from the upper left of the frame. Add ONLY this atmospheric effect:**

| # | 파일명 | 프롬프트 |
|---|---|---|
| 19 | `haze.png` | A light atmospheric haze in the air, so the light from the upper left becomes softly visible as gentle beams; slightly lifted shadows. |
| 20 | `fog.png` | Moderate fog filling the space behind the bust, the background fades into soft gray behind the bust, visible diffused light beams from the upper left. |
| 21 | `dust.png` | Fine dust particles floating in the air, sparkling where they cross the light beam from the upper left. |
| 22 | `smoke.png` | Thin drifting smoke wisps around the bust, catching the light from the upper left, moody cinematic atmosphere. |

---

## 톤 스타일 5장 → `img/presets/tonal/`

공통 문장:

> **Keep exactly the same white plaster bust, pedestal, framing and light direction as the reference photo. Change ONLY the overall tonal style:**

| # | 파일명 | 프롬프트 |
|---|---|---|
| 23 | `balanced.png` | Balanced natural tonal range: clean whites, natural midtones, soft but present shadows. |
| 24 | `high-key.png` | High-key: very bright, airy image, light background, minimal shadows, soft pastel feel. |
| 25 | `low-key.png` | Low-key: mostly dark image, deep black background, only part of the face lit, dramatic mood. |
| 26 | `high-contrast.png` | High contrast: deep blacks and bright highlights, strong punchy separation between light and shadow. |
| 27 | `low-contrast.png` | Low contrast: flat, matte, faded tones with lifted blacks and soft highlights, film-like softness. |

---

## 다 만든 뒤

- 27장(+ base.png)을 한 번에 주시면 512px WebP로 줄여서 `img/presets/` 아래에 넣고, 프리셋을 고르면 사진이 뜨게 연결합니다.
- 일부만 있어도 됩니다. 사진이 없는 항목은 지금처럼 글자로 보입니다.
- 예시 사진에는 "예시 · 실제 결과와 다를 수 있음"이 표시됩니다.

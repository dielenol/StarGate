# 8화 1부 — 015·019 생성 프롬프트

- 생성 모드: built-in `image_gen`
- 워크플로: `session-cutscene`
- 화풍: `novus-muted` / `novus-muted-scene-v1`
- 컷 번호: 사용자 원본 40컷의 015·019 유지
- 최종 이미지: 원본 PNG를 크롭·재인코딩 없이 보존

## 015 — 마가렛 관련 단서에 집중하기 시작하는 해쉬

실제 생성 입력 순서:

1. `/Users/flitto/.codex/skills/stargate-images/assets/cutscene-muted-color-reference.png`
2. `/Users/flitto/Code/StarGate/StarGateV2/public/assets/peoples/InDexer-main-image.webp`
3. `/Users/flitto/.codex/skills/stargate-images/assets/cutscene-subject-references/hash-exhaustion-preferred.png`

실제 전달한 최종 프롬프트:

```text
Prepared reference roles (array order is authoritative):
Image 1: scene art direction and finish — NOVUS muted whole-scene art direction and finish.
Image 2: identity only — 해쉬 테거 [asset ID: R-HASH]; preserve: canonical identity and distinctive facial structure; unique anatomy and non-transient character design within sceneIntent permissions.
Image 3: wardrobe/state — hash-exhaustion-state [asset ID: hash-exhaustion-state].
Use Image 1 for scene art direction and finish: gray-grounded low-chroma color naturally across skin, hair, cloth, props and environment. Preserve recognizable local hue relationships with subtle warm/cool variation, without strict grayscale or an isolated accent-only rule. Combine fine selective lines, restrained directional hatching, broad painterly light/mid/shadow planes, intentional brush edges and soft cel-like structure. Use motivated light, spatial clarity and material-specific detail. Do not flatten forms into two-tone anime shading or replace them with glossy, photorealistic or neon-washed rendering. This whole-scene reference governs line, paint, restrained color relationships and integrated scene finish together. Do not copy its characters, identity, age, wardrobe, props, pose, setting, camera, composition or dark mood. A bright scene may use the same drawing and paint language; fatigue, sadness and low-key lighting are not default story requirements.
Canonical personnel references supply identity, distinctive facial structure, anatomy and recognizable local hue relationships within sceneIntent permissions. They do not override the whole-scene rendering language. Their sourcePreserve notes are provenance, not instructions to retain an earlier wardrobe, posture, age state or drawing style. userText and sceneIntent determine scene-time age changes, expression, pose, wardrobe and condition within explicit attribute permissions and take precedence over contrary source notes. Keep each person's identity and individual proportions; do not apply a shared face or beauty template.
Intentional angular brush planes in cloth are designed form, not noise. Preserve selected hatching and deliberate value edges while removing random speckle, granular noise and accidental doubled lines. Keep large nonfocal surfaces quiet without smoothing away painterly planes or blurring focal features.
The source-story meaning in sceneIntent takes precedence over candidate pixels. userText is the original passage; narrativeMoment, carriedState and visualCues specify the intended moment and its visible evidence. Preserve carriedState and continuity, apply only allowedChanges, and do not invent any disallowedInferences. A reference's identity does not establish current survival, consciousness, injuries, emotions, actions or casting. Composition/state references provide only evidence supported by this intent. A prior candidate's expression or pose is not authoritative evidence of the story. Only attributes explicitly listed in editableAttributes may change; all other attributes, including every protectedAttributes entry, remain protected. Identity always remains protected; age follows its explicit protected or editable scope. For partial edits, this style default is not permission to convert a protected palette, change protected lighting, restage, beautify, or alter expression and pose beyond the declared scope. When editing an existing frame, apply the muted color direction only where palette is editable; otherwise preserve the target palette. For a new scene, establish the shot's naturally low-chroma palette from its brief and recognizable canonical hue relationships. All required canonical references remain attached actual images; none is audit-only.
Immutable scene intent (original text and explicit interpretation; no inferred permissions):
{
  "contractVersion": 1,
  "userText": "해쉬는 일상과 연구를 놓은 채 무너져 있다. 백장미단의 리처드가 찾아와 언론 폭로가 무산됐음을 알리고, 요한 스미스 암살 임무를 전달한다. 관련 자료에서 마가렛 수용시설로 이어지는 단서를 발견한 해쉬는 다시 움직일 이유를 얻는다. 015 마가렛 관련 단서에 집중하기 시작하는 해쉬",
  "narrativeMoment": "해쉬의 지친 몸은 그대로인 채 자료의 마가렛 수용시설 단서에 처음 시선이 붙잡히는 순간",
  "carriedState": [
    "해쉬는 검은 머리와 둥근 안경을 쓴 같은 인물이며 몸과 생활은 여전히 소진되어 있다.",
    "구겨진 흰 셔츠와 느슨한 넥타이, 처진 어깨, 어수선한 방과 자료가 유지된다."
  ],
  "allowedChanges": [
    "아주 작은 자세 변화와 눈·손의 긴장으로 집중의 시작을 표현한다."
  ],
  "visualCues": [
    "안경 너머 눈이 쥔 자료 한 지점에 뚜렷하게 머물고 손가락이 종이 가장자리를 붙잡는다.",
    "몸은 책상에 기대고 어깨는 내려앉아 있으며 옷과 머리는 흐트러져 있다."
  ],
  "disallowedInferences": [
    "정돈된 유능한 조사자처럼 완전히 회복한 자세나 활기찬 미소",
    "마가렛 또는 리처드를 현재 방에 실제로 등장시키기, 회상 콜라주"
  ],
  "editableAttributes": [
    "rendering",
    "expression",
    "pose",
    "wardrobe",
    "props",
    "camera",
    "framing",
    "composition",
    "lighting",
    "palette"
  ],
  "protectedAttributes": [
    "identity",
    "age"
  ]
}

Use case: illustration-story
Asset type: one finished StarGate narrative session cutscene frame, episode 8 part 1, user-facing cut 015
Style profile / reference policy: novus-muted / novus-muted-scene-v1
Primary request: In his neglected research room, exhausted Hash notices that the assassination dossier leads to Margaret's containment facility; a small return of attention reaches his eyes while his body remains visibly spent.
Visible subjects: Exactly one adult man, Hash / InDexer. Preserve Image 2 identity: slim angular face, narrow jaw, straight nose, thick dark eyebrows, medium-length black center-parted hair falling across his forehead, thin round metal glasses. Age and face remain recognizable. Image 3 supplies the depleted physical state and rumpled shirt, not a frozen pose or a new identity.
Environment: The cramped neglected room, desk, muted bookshelves and piles of papers. A modest desk lamp at left, soft daylight from a right-side window. Keep peripheral research clutter subdued and coherent. The room is lived-in and neglected, not destroyed.
Wardrobe / equipment / physical state: Deeply rumpled off-white shirt, open collar and loosened dark tie, untidy black hair, tired eyelids and faint under-eye shadows. His coat and waistcoat are off. His shoulders remain low and his torso still leans on the desk. Do not clean him up, straighten him into a confident professional, make him smile or transform him into a different face.
Action / blocking / eyelines: Three-quarter close medium view at desk height. Hash's face and glasses occupy the upper center-left, clearly readable and large. His eyes have just fixed on one part of the dossier held low in the foreground by one tired hand; the other forearm supports his weight on the desk. The sheet is held close, only slightly lifted. Tiny tension in the brow and grip conveys recognition; the slumped shoulders and exhausted mouth remain. This is the first glimmer of purpose, not physical recovery. A small out-of-focus facility photograph on the file can suggest the evidence; no readable labels, no pseudo-text, no portrait of Margaret and no readable invented information.
Composition/framing: One opaque horizontal frame, target 16:9, approximately 1792x1024 or closest native wide canvas. Crop at mid-torso and the desk foreground; do not zoom out to a small full-body character. Face, eyeline and dossier hand form the main narrative triangle, with room depth behind. No paneling, captions or numbers burned into the picture.
Lighting/mood: Quiet pale daylight from camera right models his face and shirt folds with clear midtones; subdued warm paper and wood bounce. The gaze is newly attentive yet he remains physically exhausted. Avoid horror lighting, neon blue screens, crushed blacks or heroic rim light.
Art direction: Image 1 sets the fine controlled linework, broad painterly value planes, naturally retained gray-grounded low-chroma color and resolved scene finish. Keep thin hair and facial lines; shade cloth through large directional planes and selective folds. Retain faint warm skin, cool black hair and muted brown-gray wood/paper; not pure grayscale and not an accent-only palette. Do not copy Image 1's girl, doll, dress, corridor or pose. Do not import the canonical portrait's clean condition.
State delta: Only focused eyes, a slight lift of the head and a small tightening of the hand on the newly meaningful evidence. Existing exhaustion and neglect remain.
Quality constraints: Resolve eyes through glasses, tired facial planes, individual fingers touching the paper, shirt tension, desk perspective and material differences. Calm broad planes; selective marks that describe form. No granular noise, sparkling texture, sharpening halos, double contours or waxy skin. One complete illustration, no collage.
Constraints: exactly one complete opaque frame; preserve every named character's identity locks and the declared continuity state; correct character count, anatomy, hands, limbs, held-object contact, scale, perspective, and spatial relationships; no unrequested character, costume, prop, injury, blood, damage, emblem, readable text, pseudo-text, watermark, UI, speech bubble, panel border, or collage.
Avoid: reference content leaking into the scene, generic stock-photo staging, duplicated people or objects, fused anatomy, costume swaps, unlisted continuity changes, and details that disappear at the target display size.

```

## 019 — 창문이 깨지고 오드가 피격되는 순간

실제 생성 입력 순서:

1. `/Users/flitto/.codex/skills/stargate-images/assets/cutscene-muted-color-reference.png`
2. `/Users/flitto/Code/StarGate/StarGateV2/public/assets/npcs/Mr-Odd-profile.webp`
3. `/Users/flitto/Code/StarGate/StarGateV2/public/assets/peoples/Clown-main-image.webp`
4. `/Users/flitto/Downloads/StarGate-S1E8-Part1/017_s1e8-part1-no-confidence-shot-017-odd-at-the-table-cutscene.png`

실제 전달한 최종 프롬프트:

```text
Prepared reference roles (array order is authoritative):
Image 1: scene art direction and finish — NOVUS muted whole-scene art direction and finish.
Image 2: identity only — Mr. 오드 [asset ID: R-ODD]; preserve: canonical identity and distinctive facial structure; unique anatomy and non-transient character design within sceneIntent permissions.
Image 3: identity only — 스타크 / CLOWN [asset ID: R-STARK]; preserve: canonical identity and distinctive facial structure; unique anatomy and non-transient character design within sceneIntent permissions.
Image 4: continuity — cafe-prior-state [asset ID: cafe-prior-state].
Use Image 1 for scene art direction and finish: gray-grounded low-chroma color naturally across skin, hair, cloth, props and environment. Preserve recognizable local hue relationships with subtle warm/cool variation, without strict grayscale or an isolated accent-only rule. Combine fine selective lines, restrained directional hatching, broad painterly light/mid/shadow planes, intentional brush edges and soft cel-like structure. Use motivated light, spatial clarity and material-specific detail. Do not flatten forms into two-tone anime shading or replace them with glossy, photorealistic or neon-washed rendering. This whole-scene reference governs line, paint, restrained color relationships and integrated scene finish together. Do not copy its characters, identity, age, wardrobe, props, pose, setting, camera, composition or dark mood. A bright scene may use the same drawing and paint language; fatigue, sadness and low-key lighting are not default story requirements.
Canonical personnel references supply identity, distinctive facial structure, anatomy and recognizable local hue relationships within sceneIntent permissions. They do not override the whole-scene rendering language. Their sourcePreserve notes are provenance, not instructions to retain an earlier wardrobe, posture, age state or drawing style. userText and sceneIntent determine scene-time age changes, expression, pose, wardrobe and condition within explicit attribute permissions and take precedence over contrary source notes. Keep each person's identity and individual proportions; do not apply a shared face or beauty template.
Intentional angular brush planes in cloth are designed form, not noise. Preserve selected hatching and deliberate value edges while removing random speckle, granular noise and accidental doubled lines. Keep large nonfocal surfaces quiet without smoothing away painterly planes or blurring focal features.
The source-story meaning in sceneIntent takes precedence over candidate pixels. userText is the original passage; narrativeMoment, carriedState and visualCues specify the intended moment and its visible evidence. Preserve carriedState and continuity, apply only allowedChanges, and do not invent any disallowedInferences. A reference's identity does not establish current survival, consciousness, injuries, emotions, actions or casting. Composition/state references provide only evidence supported by this intent. A prior candidate's expression or pose is not authoritative evidence of the story. Only attributes explicitly listed in editableAttributes may change; all other attributes, including every protectedAttributes entry, remain protected. Identity always remains protected; age follows its explicit protected or editable scope. For partial edits, this style default is not permission to convert a protected palette, change protected lighting, restage, beautify, or alter expression and pose beyond the declared scope. When editing an existing frame, apply the muted color direction only where palette is editable; otherwise preserve the target palette. For a new scene, establish the shot's naturally low-chroma palette from its brief and recognizable canonical hue relationships. All required canonical references remain attached actual images; none is audit-only.
Immutable scene intent (original text and explicit interpretation; no inferred permissions):
{
  "contractVersion": 1,
  "userText": "스타크는 파리에서 살아 돌아온 뒤 잠시 평온한 일상을 누린다. 오드가 찾아와 권한 위임을 진행하지만, 그 자리에서 저격당한다. 스타크의 품에서 오드가 사망하고, 현장 인력은 새로운 명령권자가 된 스타크의 지시를 기다린다. 019 창문이 깨지고 오드가 피격되는 순간",
  "narrativeMoment": "낮 카페에서 권한 위임 중 창문이 깨지고 오드가 총격으로 균형을 잃기 시작하는 찰나",
  "carriedState": [
    "오드는 백발·선글라스·짧은 흰 턱수염·3피스 정장, 스타크는 검은 웨이브 머리와 머리 위 선글라스·검은 정장이다.",
    "오드는 테이블 건너 왼쪽, 스타크는 오른쪽 전경이며 낮 카페와 위임 자료가 있다."
  ],
  "allowedChanges": [
    "오드의 왼쪽 윗가슴에 제한된 피격 혈흔, 몸의 비틀림, 창 유리 파손과 소량의 날리는 파편을 표현한다."
  ],
  "visualCues": [
    "깨진 창과 오드의 갑작스러운 뒤틀림이 같은 순간으로 읽힌다.",
    "스타크가 놀라 반응을 시작하고 오드에게 손을 뻗지만 아직 품에 안지는 않는다."
  ],
  "disallowedInferences": [
    "저격수 얼굴·소속·무기·탄도 설명선의 노출",
    "스타크의 부상·총상·혈흔, 이미 오드를 안고 있는 다음 컷, 과도한 신체 훼손"
  ],
  "editableAttributes": [
    "rendering",
    "expression",
    "pose",
    "wardrobe",
    "props",
    "camera",
    "framing",
    "composition",
    "lighting",
    "palette"
  ],
  "protectedAttributes": [
    "identity",
    "age"
  ]
}

Use case: illustration-story
Asset type: one finished StarGate narrative session cutscene frame, episode 8 part 1, user-facing cut 019
Style profile / reference policy: novus-muted / novus-muted-scene-v1
Primary request: A cafe window shatters at the instant Mr. Odd is struck by a sniper shot during the delegation of authority to Stark, abruptly breaking their ordinary daylight conversation.
Visible subjects: Exactly two adult men. Mr. Odd is the focal subject, an older man with swept-back white hair, lined angular face, round dark sunglasses, short white goatee, dark three-piece suit, white shirt and patterned dark tie, preserved from Image 2. Stark is the younger man from Image 3, wavy medium black hair, narrow youthful adult face, rectangular sunglasses perched on top of his head, black suit, pale shirt and dark tie. Never replace Stark with a character from another franchise. Keep both identities distinct.
Environment: The same daylight cafe as Image 4: dark mullioned tall windows behind the table, muted outdoor trees and buildings, polished small cafe table, coffee cup and saucer, water glass, restrained remnants of lunch. Authority delegation papers and a pen lie between the men. Image 4 supplies room arrangement, seating and pre-impact state only; use Image 1's quieter palette and illustrated rendering.
Wardrobe / equipment / physical state: Mr. Odd's canonical formal clothing and glasses remain. The only new injury is a restrained dark-red stain on HIS LEFT upper chest just inward from the shoulder, on the shirt at the open edge of the jacket. No exposed wound or excessive gore. Stark is completely uninjured, without blood on his face, hands or clothes at this instant.
Action / blocking / eyelines: Mr. Odd sits across the table on the left/center of the image, his upper torso jolting and twisting backward at impact, his raised conversational hand losing its gesture, mouth caught mid-breath. A single shattered window section behind and to his left sends a limited number of clear glass fragments inward, each following the same event. Keep Odd's face and left chest unobscured. Stark occupies the right foreground, turning suddenly toward him, eyes widening; one hand has just begun to reach across the table. Stark has not caught or embraced him yet. Use separate, anatomically plausible arms and hands, with no fused contact. No attacker, weapon, muzzle flash, laser, trajectory diagram or bullet drawn in the air.
Composition/framing: One horizontal opaque frame, target 16:9, closest native wide canvas. Diagonal medium shot, camera at table height, Odd's head and torso prominent, Stark readable at the right edge. Table foreground, Odd in middle depth, fractured window in back form a single coherent space. The first read must be impact and interrupted conversation, not a posed portrait or merely a broken window. No comic speed lines, panels, labels or numbers.
Lighting/mood: Abrupt danger in ordinary soft late-morning/early-afternoon daylight. Window light is shared coherently across skin, black wool, white shirt, papers and clear glass; subtle cafe warmth remains. Preserve midtones, not night, lightning or orange-blue blockbuster grading.
Art direction: Image 1 sets fine controlled linework, broad painterly value planes, restrained natural low-chroma color and a fully resolved scene. Canonical portraits set identity, age and distinctive clothing. Render mature facial structure faithfully, no beautification or de-aging. Gray-grounded skin warmth, soft weathered brown wood, restrained green-gray foliage and dark neutral tailoring. Tiny dark-red injury is subordinate to faces and action; do not turn the whole frame monochrome except for blood. Keep directional cloth planes, fine strands and selective material detail; no photorealism or glossy 3D rendering.
State delta: Window glass newly shattered, Odd's left upper-chest injury and lost balance begin; Stark only starts reacting. The subsequent collapse into Stark's arms and death are not depicted in this cut.
Quality constraints: Readable faces, distinct hands, credible seated torso twist and stable table perspective. Clear glass planes rather than noisy glitter, distinct skin/wool/paper/metal responses, calm nonfocal background. No random grain, halos, double edges or over-detailed sparkling debris.
Constraints: exactly one complete opaque frame; preserve every named character's identity locks and the declared continuity state; correct character count, anatomy, hands, limbs, held-object contact, scale, perspective, and spatial relationships; no unrequested character, costume, prop, injury, blood, damage, emblem, readable text, pseudo-text, watermark, UI, speech bubble, panel border, or collage.
Avoid: fixed-reference girl/doll/corridor content, style drift from continuity reference, generic stock-photo staging, duplicated people or objects, fused anatomy, accidental costume swaps, unlisted continuity changes, excessive gore beyond the requested ceiling, and details that disappear at the target display size.

```

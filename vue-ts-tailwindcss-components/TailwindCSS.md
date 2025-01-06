# Tailwind CSS 사용 가이드

## 1. **Tailwind CSS란?**

Tailwind CSS는 "유틸리티 클래스" 기반의 CSS 프레임워크로, 미리 정의된 클래스들을 조합하여 빠르게 스타일링할 수 있도록 도와줍니다. CSS 파일을 직접 작성하지 않고도 Tailwind의 클래스를 사용하여 디자인을 구현할 수 있습니다.

---

## 2. **Tailwind CSS 설치 방법**

### a. **Node.js 기반 설치**

1. 프로젝트 초기화:

   ```bash
   npm init -y
   ```

2. Tailwind CSS 설치:

   ```bash
   npm install -D tailwindcss postcss autoprefixer
   npx tailwindcss init
   ```

3. `tailwind.config.js` 파일 생성 후 필요한 파일 경로를 추가:

   ```javascript
   module.exports = {
     content: ["./src/**/*.{html,js}"],
     theme: {
       extend: {},
     },
     plugins: [],
   };
   ```

4. CSS 파일에 Tailwind 지시문 추가:

   ```css
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```

5. Tailwind CSS 빌드:
   ```bash
   npx tailwindcss -i ./src/input.css -o ./dist/output.css --watch
   ```

### b. **CDN 사용**

Tailwind CSS를 빠르게 적용하려면 아래의 CDN 링크를 HTML 파일에 추가:

```html
<link
  href="https://cdn.jsdelivr.net/npm/tailwindcss@latest/dist/tailwind.min.css"
  rel="stylesheet"
/>
```

---

## 3. **Tailwind CSS 기본 구조**

### a. **유틸리티 클래스**

Tailwind CSS는 특정 CSS 속성에 대한 클래스를 제공합니다.

#### 예시:

```html
<div class="bg-blue-500 text-white font-bold py-2 px-4 rounded">버튼</div>
```

- `bg-blue-500`: 파란 배경색
- `text-white`: 흰색 글자
- `font-bold`: 볼드체
- `py-2`: 위아래 패딩 0.5rem
- `px-4`: 좌우 패딩 1rem
- `rounded`: 모서리 둥글게

### b. **반응형 디자인**

Tailwind는 반응형 클래스(prefix)를 제공합니다:

- `sm`: 작은 화면 (640px 이상)
- `md`: 중간 화면 (768px 이상)
- `lg`: 큰 화면 (1024px 이상)
- `xl`: 매우 큰 화면 (1280px 이상)
- `2xl`: 초대형 화면 (1536px 이상)

#### 예시:

```html
<div class="text-base md:text-lg lg:text-xl">반응형 텍스트 크기</div>
```

### c. **상태 클래스**

Hover, Focus, Active 등의 상태에 따라 스타일 변경 가능:

#### 예시:

```html
<button class="bg-blue-500 hover:bg-blue-700 focus:ring focus:ring-blue-300">
  상태 버튼
</button>
```

---

## 4. **Tailwind CSS 핵심 기능**

### a. **Flexbox & Grid**

Tailwind는 Flexbox와 Grid를 쉽게 사용할 수 있도록 클래스를 제공합니다.

#### Flexbox 예시:

```html
<div class="flex justify-center items-center h-screen">중앙 정렬된 콘텐츠</div>
```

- `flex`: Flexbox 활성화
- `justify-center`: 가로 중앙 정렬
- `items-center`: 세로 중앙 정렬
- `h-screen`: 화면 높이 100%

#### Grid 예시:

```html
<div class="grid grid-cols-3 gap-4">
  <div class="bg-gray-200">1</div>
  <div class="bg-gray-300">2</div>
  <div class="bg-gray-400">3</div>
</div>
```

- `grid`: Grid 활성화
- `grid-cols-3`: 3열 그리드
- `gap-4`: 그리드 간격 1rem

### b. **Typography**

Tailwind에서 글꼴 스타일링을 간편하게:

```html
<p class="text-lg font-medium text-gray-600">Tailwind CSS로 텍스트 스타일링</p>
```

- `text-lg`: 글자 크기
- `font-medium`: 글자 굵기
- `text-gray-600`: 텍스트 색상

### c. **Spacing**

Tailwind는 마진과 패딩을 간단히 정의할 수 있습니다:

```html
<div class="m-4 p-6">여백과 패딩 적용</div>
```

- `m-4`: 마진 1rem
- `p-6`: 패딩 1.5rem

---

## 5. **Tailwind CSS 확장 기능**

### a. **플러그인 사용**

Tailwind는 플러그인을 사용하여 기능을 확장할 수 있습니다.

#### 예시: `@tailwindcss/forms` 설치

```bash
npm install @tailwindcss/forms
```

`tailwind.config.js`에 추가:

```javascript
plugins: [require("@tailwindcss/forms")];
```

### b. **Custom Utility Classes**

`tailwind.config.js`에서 사용자 정의 클래스를 추가할 수 있습니다:

```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        customBlue: "#1E40AF",
      },
    },
  },
};
```

사용:

```html
<div class="bg-customBlue text-white">사용자 정의 색상</div>
```

---

## 6. **Tailwind CSS 베스트 프랙티스**

1. **HTML 클래스 이름 관리:**

   - 클래스가 너무 길어지면 `@apply`를 사용해 CSS 파일로 분리:
     ```css
     .btn {
       @apply bg-blue-500 text-white py-2 px-4 rounded;
     }
     ```

2. **JIT 모드 활성화:**

   - Tailwind CSS의 JIT(Just-In-Time) 모드를 사용하면 빌드 시간이 단축되고 사용하지 않는 CSS가 제거됩니다.
     ```javascript
     module.exports = {
       mode: "jit",
       content: ["./src/**/*.{html,js}"],
     };
     ```

3. **반복 줄이기:**
   - 반복적인 스타일은 컴포넌트로 분리해 재사용성을 높이세요.

---

## 7. **Tailwind CSS로 구현 예시**

### 버튼

```html
<button
  class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
>
  클릭하세요
</button>
```

### 카드

```html
<div class="max-w-sm rounded overflow-hidden shadow-lg">
  <img class="w-full" src="image.jpg" alt="Image" />
  <div class="px-6 py-4">
    <div class="font-bold text-xl mb-2">카드 제목</div>
    <p class="text-gray-700 text-base">카드 설명 내용</p>
  </div>
</div>
```

---

## 8. **추가 자료**

- [공식 문서](https://tailwindcss.com/docs): Tailwind CSS의 최신 기능과 가이드.
- [Tailwind Play](https://play.tailwindcss.com/): Tailwind CSS를 바로 테스트할 수 있는 온라인 도구.
- [Flowbite](https://flowbite.com/): Tailwind 기반 UI 컴포넌트.
- [DaisyUI](https://daisyui.com/): Tailwind 확장 라이브러리.

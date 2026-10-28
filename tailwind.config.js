/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                corporate: {
                    primary: 'var(--bg-primary)',
                    secondary: 'var(--bg-secondary)',
                    elevated: 'var(--bg-elevated)',
                    glass: 'var(--bg-surface-glass)',
                    accent: 'var(--accent-primary)',
                    hover: 'var(--accent-hover)',
                    text: 'var(--text-primary)',
                    'text-secondary': 'var(--text-secondary)',
                    muted: 'var(--text-muted)',
                    border: 'var(--border-subtle)',
                    'border-strong': 'var(--border-strong)',
                    'border-active': 'var(--border-active)',
                }
            },
            fontFamily: {
                display: ['Manrope', 'sans-serif'],
                technical: ['Space Grotesk', 'monospace'],
                sans: ['Manrope', 'sans-serif'],
            },
            letterSpacing: {
                'monolith': '0.16em',
                'technical': '0.08em',
            }
        },
    },
    plugins: [],
}

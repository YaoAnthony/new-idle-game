/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // Enable dark mode
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      
      fontFamily: {
        grotesk: ['"Space Grotesk"', 'sans-serif'],
      },
      screens: {
        'xs': '320px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
        '3xl': '1920px',
        '4xl': '2560px',
      },
      padding: {
        '1': '0.25rem',
        '2': '0.5rem',
        '3': '0.75rem',
        '4': '1rem',
        '5': '1.25rem',
        '6': '1.5rem',
        '7': '1.75rem',
        '8': '2rem',
        '9': '2.25rem',
        '10': '2.5rem',
        '12': '3rem',
        '16': '4rem',
        '18': '4.5rem',
        '20': '5rem',
        '24': '6rem',
        '28': '7rem',
        '32': '8rem',
        '40': '10rem',
        '45': '11.25rem',
        '48': '12rem',
        '56': '14rem',
        '64': '16rem',
        '72': '18rem',
        '80': '20rem',
        '88': '22rem',
        '96': '24rem',
        '104': '26rem',
      }, 
      boxShadow: {
        'custom': 'rgba(99, 99, 99, 0.2) 0px 2px 8px 0px',
        'glow' : "0 8px 32px rgba(100, 149, 237, 0.45)",
        'custom-select': 'rgba(0, 0, 0, 0.24) 0px 3px 8px'
      },
      colors: {
        'primary': '#1E3A8A', // Blue
        'secondary': '#FBBF24', // Yellow
        'accent': '#9333EA', // Purple
        'background': '#F9FAFB', // Light Gray
        'text': '#111827', // Dark Gray
        'border': '#D1D5DB', // Gray
        'success': '#10B981', // Green
        'warning': '#F59E0B', // Orange
        'error': '#EF4444', // Red

        system: {
          bg: 'rgb(var(--system-bg) / <alpha-value>)',
          shell: 'rgb(var(--system-shell) / <alpha-value>)',
          panel: 'rgb(var(--system-panel) / <alpha-value>)',
          raised: 'rgb(var(--system-raised) / <alpha-value>)',
          line: 'rgb(var(--system-line) / <alpha-value>)',
          text: 'rgb(var(--system-text) / <alpha-value>)',
          muted: 'rgb(var(--system-muted) / <alpha-value>)',
          faint: 'rgb(var(--system-faint) / <alpha-value>)',
          accent: 'rgb(var(--system-accent) / <alpha-value>)',
          action: 'rgb(var(--system-action) / <alpha-value>)',
          success: 'rgb(var(--system-success) / <alpha-value>)',
          danger: 'rgb(var(--system-danger) / <alpha-value>)',
          violet: 'rgb(var(--system-violet) / <alpha-value>)',
        },


        'dark-background': '#0c0c0c', // Dark Gray
        'dark-background-secondary': '#1D1E23', // Darker Gray
        'dark-login-background': '#1f1f1f', // Darker Gray
        'dark-background-tertiary': '#181818', // Dark Gray
        'dark-text-primary': '#E5E7EB', // Light Gray
        'dark-text-secondary': '#6b6e75', // Gray
        'dark-code-background-primary': '#0c0c0c', // Dark Gray
        'dark-code-background-secondary': '#1D1E23', // Darker Gray

        //githubScan background
        'githubScan-dark-primary': '#1f1f1f',
        'githubScan-dark-secondary': '#101010',

        'white-background': '#edecea', // White
        'white-background-secondary': '#f5f5f5', // Light Gray
        'white-background-tertiary': '#fcfcf8', // White
        'white-text-primary': '#000000', // Black
        'white-text-secondary': '#a0a099', // Gray

        'white-code-background-primary': '#ffffff', // White
        'white-code-background-secondary': '#f5f5f5', // Light Gray

        'code-string': '#CE9178',
        'code-number': '#B5CEA8',
        'code-keyword': '#569CD6',
        'code-comment': '#6A9955',
        'code-function': '#DCDCAA',
        'code-operator': '#d4d4d4',
        'code-default':'#9CDCFE',

        // VS Code VS Dark theme colors
        'vscode-bg': '#1e1e1e', // Editor background
        'vscode-sidebar': '#252526', // Sidebar
        'vscode-header': '#2d2d2d', // Top bar (slightly lighter than sidebar) // #333333 is activity bar
        'vscode-border': '#3e3e42', // Borders/Splitters
        'vscode-text': '#cccccc', // Default text
        'vscode-selection': '#264f78', // Selection
        'vscode-line-highlight': '#2f3239', // Line highlight (optional)
        'vscode-tab-active': '#1e1e1e',
        'vscode-tab-inactive': '#2d2d2d',
      }
    },
  },
  plugins: [
    require("tailwind-scrollbar-hide"),
  ],
}

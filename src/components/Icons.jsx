/**
 * Jeu d'icônes en SVG inline : pas de dépendance, elles héritent de `currentColor`
 * et restent nettes à toutes les tailles.
 */

function Icon({ size = 19, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconCursor = (props) => (
  <Icon {...props}>
    <path d="M5 3.5 5 18l3.9-3.7 2.5 5.6 2.3-1-2.5-5.5 5.4-.2Z" fill="currentColor" strokeWidth="1.4" />
  </Icon>
)

export const IconPen = (props) => (
  <Icon {...props}>
    <path d="M12 20h8" />
    <path d="M16.2 3.8a2 2 0 0 1 2.8 2.8L8.4 17.2 4 18.5l1.3-4.4Z" />
  </Icon>
)

export const IconEraser = (props) => (
  <Icon {...props}>
    <path d="M11 20h9" />
    <path d="M3.9 14.6 10 8.4a2 2 0 0 1 2.8 0l4.3 4.3a2 2 0 0 1 0 2.8l-4.6 4.6H8.4l-4.5-4.5a2 2 0 0 1 0-1Z" />
  </Icon>
)

export const IconLink = (props) => (
  <Icon {...props}>
    <path d="M4 18c4.5 0 5.5-2.5 6-6s1.5-6 6-6" />
    <path d="m13.5 3.5 2.8 2.5-2.8 2.5" />
    <circle cx="4" cy="18" r="1.6" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconGroup = (props) => (
  <Icon {...props}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" strokeDasharray="4 3" />
    <path d="M7 8.5h5" />
  </Icon>
)

export const IconHand = (props) => (
  <Icon {...props}>
    <path d="M8 12.5V5.6a1.4 1.4 0 0 1 2.8 0v5.6" />
    <path d="M10.8 11.2V4.4a1.4 1.4 0 0 1 2.8 0v6.8" />
    <path d="M13.6 11.2V6.4a1.4 1.4 0 0 1 2.8 0V15a5.5 5.5 0 0 1-5.5 5.5h-.6A5.3 5.3 0 0 1 5 15.2l-.4-2.4a1.3 1.3 0 0 1 2.4-.9l1 2.1" />
  </Icon>
)

export const IconImage = (props) => (
  <Icon {...props}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="8.6" cy="9.6" r="1.5" />
    <path d="m4.5 17.5 4.4-4.4 3 3 3.4-3.4 4.2 4.2" />
  </Icon>
)

export const IconCode = (props) => (
  <Icon {...props}>
    <path d="m9 8-4.5 4L9 16" />
    <path d="m15 8 4.5 4L15 16" />
  </Icon>
)

export const IconSketch = (props) => (
  <Icon {...props}>
    <path d="m11 3.5 1.7 4.3 4.3 1.7-4.3 1.7L11 15.5 9.3 11.2 5 9.5l4.3-1.7Z" />
    <path d="m18 15.5.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" />
  </Icon>
)

export const IconUndo = (props) => (
  <Icon {...props}>
    <path d="M9.5 14.5 5 10l4.5-4.5" />
    <path d="M5 10h9a5 5 0 0 1 0 10h-3.5" />
  </Icon>
)

export const IconRedo = (props) => (
  <Icon {...props}>
    <path d="M14.5 14.5 19 10l-4.5-4.5" />
    <path d="M19 10h-9a5 5 0 0 0 0 10h3.5" />
  </Icon>
)

export const IconTrash = (props) => (
  <Icon {...props}>
    <path d="M4.5 7h15" />
    <path d="M9.5 7V5.4A1.4 1.4 0 0 1 11 4h2a1.4 1.4 0 0 1 1.5 1.4V7" />
    <path d="m6.8 7 .9 12.1A1.9 1.9 0 0 0 9.6 21h4.8a1.9 1.9 0 0 0 1.9-1.9L17.2 7" />
    <path d="M10.5 11v6M13.5 11v6" />
  </Icon>
)

export const IconMinus = (props) => (
  <Icon {...props}>
    <path d="M5.5 12h13" />
  </Icon>
)

export const IconPlus = (props) => (
  <Icon {...props}>
    <path d="M12 5.5v13M5.5 12h13" />
  </Icon>
)

export const IconDownload = (props) => (
  <Icon {...props}>
    <path d="M12 4v10" />
    <path d="m8 10.5 4 4 4-4" />
    <path d="M5 19.5h14" />
  </Icon>
)

export const IconPause = (props) => (
  <Icon {...props}>
    <path d="M9.5 5v14M14.5 5v14" />
  </Icon>
)

export const IconPlay = (props) => (
  <Icon {...props}>
    <path d="M7.5 4.8 19 12 7.5 19.2Z" fill="currentColor" strokeWidth="1.4" />
  </Icon>
)

export const IconSquare = (props) => (
  <Icon {...props}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
  </Icon>
)

export const IconCircle = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
  </Icon>
)

export const IconTriangle = (props) => (
  <Icon {...props}>
    <path d="M12 4.5 20.5 19.5H3.5Z" />
  </Icon>
)

export const IconDiamond = (props) => (
  <Icon {...props}>
    <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />
  </Icon>
)

export const IconLine = (props) => (
  <Icon {...props}>
    <path d="M4.5 19.5 19.5 4.5" />
  </Icon>
)

export const IconArrow = (props) => (
  <Icon {...props}>
    <path d="M4.5 19.5 19.5 4.5" />
    <path d="M12.5 4.5h7v7" />
  </Icon>
)

export const IconFill = (props) => (
  <Icon {...props}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <path d="M3.5 14 14 3.5M3.5 19.5 19.5 3.5M8.5 20.5 20.5 8.5M14 20.5l6.5-6.5" strokeWidth="1.1" opacity="0.8" />
  </Icon>
)

export const IconBoardPlus = (props) => (
  <Icon {...props}>
    <path d="M20.5 12.5v-6a2 2 0 0 0-2-2h-13a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7" />
    <path d="M17.5 15.5v6M14.5 18.5h6" />
  </Icon>
)

export const IconBraces = (props) => (
  <Icon {...props}>
    <path d="M9 3.5c-2 0-2.5 1-2.5 3s0 3.5-2.5 3.5c2.5 0 2.5 1.5 2.5 3.5s.5 3 2.5 3" />
    <path d="M15 3.5c2 0 2.5 1 2.5 3s0 3.5 2.5 3.5c-2.5 0-2.5 1.5-2.5 3.5s-.5 3-2.5 3" />
  </Icon>
)

export const IconUpload = (props) => (
  <Icon {...props}>
    <path d="M12 15.5v-11" />
    <path d="m8 8.5 4-4 4 4" />
    <path d="M5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-3" />
  </Icon>
)

export const IconExportSelection = (props) => (
  <Icon {...props}>
    <rect x="3.5" y="3.5" width="12" height="12" rx="2" strokeDasharray="3.5 2.6" />
    <path d="M17 12.5v7" />
    <path d="m14 16.5 3 3 3-3" />
  </Icon>
)

export const IconShare = (props) => (
  <Icon {...props}>
    <circle cx="17.5" cy="5.5" r="2.8" />
    <circle cx="6" cy="12" r="2.8" />
    <circle cx="17.5" cy="18.5" r="2.8" />
    <path d="m8.5 10.6 6.6-3.7M8.5 13.4l6.6 3.7" />
  </Icon>
)

export const IconCopy = (props) => (
  <Icon {...props}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
    <path d="M15.5 5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2" />
  </Icon>
)

export const IconText = (props) => (
  <Icon {...props}>
    <path d="M5 6.5V4.5h14v2M12 4.5v15M9 19.5h6" />
  </Icon>
)

export const IconNote = (props) => (
  <Icon {...props}>
    <path d="M4.5 5.5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v9l-5 5h-9a1 1 0 0 1-1-1Z" />
    <path d="M19.5 14.5h-4a1 1 0 0 0-1 1v4" />
  </Icon>
)

/** Icône d'alignement : le repère et deux blocs qui s'y collent. */
export const IconAlign = ({ mode = 'left', ...props }) => {
  const vertical = mode === 'top' || mode === 'centerY' || mode === 'bottom'
  const axis = vertical ? mode.replace('top', 'left').replace('bottom', 'right').replace('centerY', 'centerX') : mode
  const guide = axis === 'left' ? 4 : axis === 'right' ? 20 : 12
  const bar = (y, width) => {
    const x = axis === 'left' ? 5.5 : axis === 'right' ? 18.5 - width : 12 - width / 2
    return <rect x={x} y={y} width={width} height="5" rx="1.6" />
  }
  return (
    <Icon {...props}>
      <g transform={vertical ? 'rotate(90 12 12)' : undefined}>
        <path d={`M${guide} 3.5v17`} strokeWidth="1.9" />
        {bar(5.2, 13)}
        {bar(13.8, 8)}
      </g>
    </Icon>
  )
}

export const IconCheck = (props) => (
  <Icon {...props}>
    <path d="m5 12.5 4.5 4.5L19 7" strokeWidth="2.4" />
  </Icon>
)

export const IconTree = (props) => (
  <Icon {...props}>
    <rect x="8.5" y="2.5" width="7" height="4.5" rx="1.4" />
    <rect x="2.5" y="16.5" width="7" height="4.5" rx="1.4" />
    <rect x="14.5" y="16.5" width="7" height="4.5" rx="1.4" />
    <path d="M12 7v3.5M6 16.5V12h12v4.5" />
  </Icon>
)

export const IconOutline = (props) => (
  <Icon {...props}>
    <path d="M3.5 5h17M7.5 10.5h13M11.5 16h9M11.5 21h9" />
  </Icon>
)

export const IconRadial = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="2.6" />
    <circle cx="12" cy="3.8" r="1.8" />
    <circle cx="19.4" cy="16" r="1.8" />
    <circle cx="4.6" cy="16" r="1.8" />
    <path d="M12 9.4V5.6M13.6 13.3l4.2 1.9M10.4 13.3l-4.2 1.9" />
  </Icon>
)

export const IconMindmap = (props) => (
  <Icon {...props}>
    <rect x="9" y="9.5" width="6" height="5" rx="1.5" />
    <rect x="17.5" y="3.5" width="5" height="4" rx="1.4" />
    <rect x="17.5" y="16.5" width="5" height="4" rx="1.4" />
    <rect x="1.5" y="10" width="5" height="4" rx="1.4" />
    <path d="M15 12c2.5 0 2.5-6.5 5-6.5M15 12c2.5 0 2.5 6.5 5 6.5M9 12H6.5" />
  </Icon>
)

/** Aperçu d'un style de fil : trait, avec ou sans pointe à chaque bout. */
export const IconArrowStyle = ({ start, end, ...props }) => (
  <Icon {...props}>
    <path d="M5 12h14" />
    {start && <path d="m9 8-4 4 4 4" />}
    {end && <path d="m15 8 4 4-4 4" />}
  </Icon>
)

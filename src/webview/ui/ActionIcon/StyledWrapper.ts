import styled, { css, FlattenInterpolation, ThemeProps, DefaultTheme } from 'styled-components';

type SizeKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type VariantKey = 'subtle';

const sizeMap: Record<SizeKey, number> = {
  xs: 20,
  sm: 22,
  md: 24,
  lg: 28,
  xl: 32
};

const variants: Record<VariantKey, FlattenInterpolation<ThemeProps<DefaultTheme>>> = {
  subtle: css`
    color: ${(props) => props.theme.colors.text.muted};
    background: transparent;
    &:hover:not(:disabled) {
      color: ${(props) => props.theme.text};
      background: ${(props) => props.theme.dropdown.hoverBg};
    }
  `
};

interface ActionIconProps {
  $size?: SizeKey | number;
  $variant?: VariantKey;
  $color?: string;
  $colorOnHover?: string;
}

const StyledWrapper = styled.button<ActionIconProps>`
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;

  width: ${(props) => sizeMap[props.$size as SizeKey] || props.$size}px;
  height: ${(props) => sizeMap[props.$size as SizeKey] || props.$size}px;

  ${(props) => variants[props.$variant as VariantKey] || variants.subtle}

  ${(props) => props.$color && css`
    color: ${props.$color};
  `}

  svg {
    stroke: currentColor;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  ${(props) => props.$colorOnHover && css`
    &:hover:not(:disabled) {
      color: ${props.$colorOnHover};
    }
  `}
`;

export default StyledWrapper;

import { AvatarId } from 'shared';

interface AvatarProps {
  name: string;
  avatarId: AvatarId;
  avatarColor: string;
  size?: 'sm' | 'md' | 'lg';
  isCurrentTurn?: boolean;
  isDisconnected?: boolean;
}

const SIZES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg',
};

export default function Avatar({
  name,
  avatarId,
  avatarColor,
  size = 'md',
  isCurrentTurn = false,
  isDisconnected = false,
}: AvatarProps) {
  const letter = name.charAt(0).toUpperCase();
  const sizeClass = SIZES[size];

  return (
    <div
      className={`
        relative rounded-full flex items-center justify-center font-bold text-white
        transition-all duration-300 select-none
        ${sizeClass}
        ${isCurrentTurn ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-transparent shadow-[0_0_12px_rgba(250,204,21,0.5)]' : ''}
        ${isDisconnected ? 'opacity-40 grayscale' : ''}
      `}
      style={{ backgroundColor: avatarColor }}
      title={name}
    >
      {avatarId === 'default' ? (
        <span>{letter}</span>
      ) : (
        // Placeholder for custom avatars - shows letter for now
        <span>{letter}</span>
      )}
    </div>
  );
}

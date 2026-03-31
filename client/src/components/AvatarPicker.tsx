import { AvatarId } from 'shared';
import Avatar from './Avatar';

const AVATAR_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
  '#EC4899', '#F97316', '#14B8A6', '#6366F1', '#D946EF',
];

interface AvatarPickerProps {
  selectedAvatarId: AvatarId;
  selectedColor: string;
  name: string;
  onSelectAvatar: (id: AvatarId) => void;
  onSelectColor: (color: string) => void;
}

export default function AvatarPicker({
  selectedAvatarId,
  selectedColor,
  name,
  onSelectAvatar,
  onSelectColor,
}: Readonly<AvatarPickerProps>) {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* Preview */}
      <Avatar
        name={name || '?'}
        avatarId={selectedAvatarId}
        avatarColor={selectedColor}
        size="lg"
      />

      {/* Color picker */}
      <div className="flex gap-1.5 flex-wrap justify-center">
        {AVATAR_COLORS.map(color => (
          <button
            key={color}
            onClick={() => onSelectColor(color)}
            className={`w-6 h-6 rounded-full transition-all ${
              selectedColor === color
                ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110'
                : 'hover:scale-110'
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}

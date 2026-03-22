import { DEFAULT_MOTOR_SPEED } from '../../utils/constants';

export function computeDriverAngle(
  time: number,
  speed: number,
  initialAngle: number,
): number {
  return initialAngle + time * speed * DEFAULT_MOTOR_SPEED;
}

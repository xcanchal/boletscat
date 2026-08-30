export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 20;

export function passwordRequirements(password) {
  const value = typeof password === "string" ? password : "";
  return {
    length: value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH,
    letter: /\p{L}/u.test(value),
    number: /\p{N}/u.test(value),
    symbol: /[^\p{L}\p{N}\s]/u.test(value),
  };
}

export function isPasswordValid(password) {
  return Object.values(passwordRequirements(password)).every(Boolean);
}

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { Ceremonies, Options } from './auth';

export const webauthn: Ceremonies = {
  registrationOptions: async ({ rpID, excludeIds }) =>
    (await generateRegistrationOptions({
      rpName: 'Booth finder admin',
      rpID,
      userName: 'owner',
      userID: new TextEncoder().encode('owner'),
      attestationType: 'none',
      excludeCredentials: excludeIds.map((id) => ({ id })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    })) as unknown as Options,
  async verifyRegistration({ response, challenge, origin, rpID }) {
    try {
      const v = await verifyRegistrationResponse({
        response: response as RegistrationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
      if (!v.verified) return null;
      const c = v.registrationInfo.credential;
      return { id: c.id, publicKey: c.publicKey, counter: c.counter, transports: c.transports ?? [] };
    } catch {
      return null;
    }
  },
  authenticationOptions: async ({ rpID }) =>
    (await generateAuthenticationOptions({ rpID, userVerification: 'required' })) as unknown as Options,
  async verifyAuthentication({ response, challenge, origin, rpID, credential }) {
    try {
      const v = await verifyAuthenticationResponse({
        response: response as AuthenticationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: { ...credential, publicKey: new Uint8Array(credential.publicKey) },
        requireUserVerification: true,
      });
      return v.verified ? { newCounter: v.authenticationInfo.newCounter } : null;
    } catch {
      return null;
    }
  },
};

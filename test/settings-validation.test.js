const test = require('node:test');
const assert = require('node:assert/strict');
const { updateSettingsSchema } = require('../dist/validators/settings.validator.js');

test('settings accepts the supported operational fields', () => {
    const result = updateSettingsSchema.safeParse({
        gym_address: '  80 Main Road  ',
        gym_phone: '9844126052',
        expiry_reminder_days: 10,
        grace_period_days: 2,
        online_registration: false,
        refunds_enabled: true,
    });

    assert.equal(result.success, true);
    assert.equal(result.data.gym_address, '80 Main Road');
});

test('settings rejects invalid phone numbers and rule ranges', () => {
    assert.equal(updateSettingsSchema.safeParse({ gym_phone: '123' }).success, false);
    assert.equal(updateSettingsSchema.safeParse({ expiry_reminder_days: 0 }).success, false);
    assert.equal(updateSettingsSchema.safeParse({ expiry_reminder_days: 31 }).success, false);
    assert.equal(updateSettingsSchema.safeParse({ grace_period_days: -1 }).success, false);
    assert.equal(updateSettingsSchema.safeParse({ grace_period_days: 31 }).success, false);
});

test('settings does not allow clients to change the fixed brand name', () => {
    const result = updateSettingsSchema.safeParse({ gym_name: 'Another Gym' });
    assert.equal(result.success, true);
    assert.equal(Object.hasOwn(result.data, 'gym_name'), false);
});

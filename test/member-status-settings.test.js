const test = require('node:test');
const assert = require('node:assert/strict');
const { computeStatus } = require('../dist/services/member-management.service.js');

const localDateFromToday = (offset) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const memberExpiringIn = (days) => ({
    status: 'active',
    access_state: 'normal',
    expiry_date: localDateFromToday(days),
});

test('expiry reminder setting controls the expiring-soon window', () => {
    assert.equal(computeStatus(memberExpiringIn(8), 7, 3), 'active');
    assert.equal(computeStatus(memberExpiringIn(7), 7, 3), 'expiring_soon');
});

test('grace period keeps membership eligible through the configured final day', () => {
    assert.equal(computeStatus(memberExpiringIn(-3), 7, 3), 'expiring_soon');
    assert.equal(computeStatus(memberExpiringIn(-4), 7, 3), 'expired');
});

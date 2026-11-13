import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { KeyboardAvoidingView } from 'react-native';
import TechnicianIssueReport from './TechnicianIssueReport';

jest.mock('../../../api/support-cases.api', () => ({ supportCasesApi: { createTechnicianReport: jest.fn() } }));

describe('TechnicianIssueReport keyboard', () => {
  it('lifts the sheet above the keyboard so "Gửi báo cáo" stays tappable', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<TechnicianIssueReport orderId="o1" />); });
    act(() => { tree.root.findByProps({ testID: 'tech-issue-report-open' }).props.onPress(); });
    const kav = tree.root.findByType(KeyboardAvoidingView);
    expect(kav.props.behavior).toBe('padding');
    expect(kav.findAll(node => node.props.testID === 'tech-issue-report-submit').length).toBeGreaterThan(0);
  });
});

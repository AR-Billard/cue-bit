# Physics Engine Status

이 문서는 현실 당구 물리현상과 현재 `Simulation2D` 구현 상태를 비교합니다.

상태 기준:

- `구현`: 현재 물리엔진에 명확한 로직이 있음
- `부분 구현`: 초보자용 경로 예측을 위한 근사 로직이 있음
- `미구현`: 현재 물리엔진에 별도 로직이 없음

| 현실 당구 물리 현상 | 구현 상태 | 현재 구현 방식 / 비고 |
|---|---:|---|
| 당구대 크기, 공 반지름, meter 좌표계 | 구현 | `physics_constants.ts`의 `TABLE_WIDTH_M`, `TABLE_HEIGHT_M`, `BALL_RADIUS_M` 사용 |
| 타격 세기 -> 초기 속도 | 구현 | `impulseScale`로 `power`를 초기 속도로 변환 |
| 공의 2D 직선 이동 | 구현 | `position += velocity * time` 기반 직접 적분 |
| 구름 마찰 감속 | 구현 | `rollingFriction * GRAVITY` 기반 감속 |
| 미끄러짐 -> 자연 구름 전환 | 부분 구현 | `topSpin`이 이동 중 감속에 영향을 주고 `spinFriction`으로 감소 |
| 상단 스핀으로 이동거리 증가 | 부분 구현 | `followDrawMotionTransfer`로 충돌 전 감속을 줄임 |
| 하단 스핀으로 이동거리 감소 | 부분 구현 | `followDrawMotionTransfer`로 충돌 전 감속을 키움 |
| 공 정지 조건 | 구현 | `stopSpeed`, `spinStopSpeed` 기준 |
| 쿠션 충돌 감지 | 구현 | 이동 구간 안의 가장 가까운 쿠션 접촉점을 계산 |
| 쿠션 반사 | 구현 | 좌우/상하 쿠션별 법선 방향 속도 반전 |
| 쿠션 반발계수 | 구현 | `cushionRestitution` 적용 |
| 무스핀 쿠션 접선 속도 보존 | 구현 | 무스핀일 때 접선 방향 속도를 강제로 바꾸지 않음 |
| 좌/우 스핀의 쿠션 반응 | 부분 구현 | `cushionSpinTransfer`에 입사각/속도 보정을 섞어 접선 방향 속도 보정 |
| 쿠션 충돌 후 스핀 소모 | 부분 구현 | `cushionSpinRetention`으로 쿠션에 맞은 뒤 좌우 스핀 일부 감소 |
| 공-공 충돌 감지 | 구현 | 이전 위치와 현재 위치 사이의 swept collision 검사 |
| 공-공 충돌 반발 | 구현 | 같은 질량 탄성 충돌 근사, `ballRestitution` 적용 |
| 좌/우 스핀의 공-공 충돌 영향 | 부분 구현 | 수구의 접선 방향 속도만 `ballSpinTransfer`로 보정 |
| 상단 스핀 오시 | 부분 구현 | 공-공 충돌 후 수구를 충돌선 진행 방향으로 보정 |
| 하단 스핀 끌림 | 부분 구현 | 공-공 충돌 후 수구를 충돌선 반대 방향으로 보정 |
| 공-공 충돌 후 스핀 소모 | 부분 구현 | `ballSpinRetention`으로 충돌 후 수구 스핀 일부 감소 |
| 과한 스핀 보정 제한 | 구현 | `maxSpinCorrectionSpeed`, `maxCushionSpinCorrectionRatio`로 폭주 방지 |
| 스핀 감쇠 | 부분 구현 | `spinFriction`으로 side/top spin을 시간에 따라 단순 감소 |
| 정지 상태 제자리 스핀 정리 | 구현 | 속도가 멈춘 공의 남은 스핀은 경로에 영향이 없어 즉시 제거 |
| 잘못된 입력값 방어 | 구현 | `predict()`에서 angle/power/maxSteps/spin 입력의 NaN과 범위 초과를 정리 |
| 최종 위치 반환 | 구현 | `summary.finalPositions`, `predictFinalPositions()` 반환 |
| 충돌/쿠션 이벤트 기록 | 구현 | `events`, `activeContacts` 사용 |
| 컷샷 throw | 부분 구현 | `cutThrowTransfer`로 컷 두께와 속도에 따른 목적구 접선 방향 보정 |
| 목적구에 전달되는 회전 | 미구현 | 안정성을 위해 목적구 스핀 전달은 아직 모델링하지 않음 |
| 좌/우 스핀에 의한 주행 중 커브/swerve | 미구현 | 2D 직선 이동 중심, 마세이성 휘어짐 없음 |
| 마세이 | 미구현 | z축/큐 기울기/강한 회전 모델 없음 |
| 점프샷 | 미구현 | z축 물리 없음 |
| 큐 미스, 팁 미끄러짐 | 미구현 | 과한 당점 입력도 clamp만 적용 |
| 스쿼트/디플렉션 | 미구현 | 타격 직후 수구가 조준선에서 벗어나는 효과 없음 |
| 쿠션 압축/속도별 반발 변화 | 미구현 | 쿠션 반발은 고정 계수 |
| 테이블 천 상태, 습도, 공 오염 | 미구현 | 단일 `rollingFriction` 값으로만 근사 |

## 최근 반영

- `followDrawMotionTransfer` 추가
- `cutThrowTransfer` 추가
- `maxSpinCorrectionSpeed`, `maxCushionSpinCorrectionRatio` 추가
- `cushionSpinRetention`, `ballSpinRetention` 추가
- 상/하 스핀이 충돌 전 이동거리와 감속에 영향을 주도록 개선
- 컷샷에서 목적구 각도가 아주 조금 틀어지는 throw 근사 추가
- 좌/우 스핀의 쿠션 반응을 입사각/속도 기반으로 보정
- 과한 스핀 입력이 충돌 순간 속도를 비현실적으로 튀게 만들지 않도록 clamp 추가
- 정지 상태의 제자리 스핀을 정리해서 불필요한 예측 루프 감소
- `predict()` 입력값 방어 로직 추가
- 최종 위치만 필요한 호출부를 위한 `predictFinalPositions()` 추가
- 하단 스핀 정면 충돌 후 수구가 뒤로 빠지는 회귀 테스트 유지

## 다음 우선순위

1. 실측 데이터 기반으로 `rollingFriction`, `impulseScale`, `cushionRestitution` 재보정
2. 좌/우 스핀의 쿠션 반응을 실제 촬영 데이터와 비교해 계수 보정
3. 목적구에 전달되는 회전 근사 추가 여부 검토
4. 스쿼트/디플렉션은 초보자용 UI에서 필요한지 확인 후 선택적으로 구현

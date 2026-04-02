import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/ws' })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('EventsGateway');
  private clients = new Map<string, { userId: string; role: string; companyId: string }>();

  handleConnection(client: Socket) {
    this.logger.log(`Подключился: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.clients.delete(client.id);
    this.logger.log(`Отключился: ${client.id}`);
  }

  @SubscribeMessage('authenticate')
  handleAuthenticate(@ConnectedSocket() client: Socket, @MessageBody() data: { userId: string; role: string; companyId: string }) {
    this.clients.set(client.id, data);
    client.join(`company:${data.companyId}`);
    client.join(`user:${data.userId}`);
    this.logger.log(`Авторизован: ${data.role} - ${data.userId}`);
    return { success: true, message: 'Подключён к SafeHos' };
  }

  sendEventToModerators(companyId: string, eventData: any) {
    this.server.to(`company:${companyId}`).emit('new_suspicious_event', eventData);
  }

  sendDecisionToDispatchers(companyId: string, decisionData: any) {
    this.server.to(`company:${companyId}`).emit('decision_made', decisionData);
  }
}

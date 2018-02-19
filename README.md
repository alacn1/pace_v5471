# pace_v5471
Firmware e ferramentas para o Router GVT Pace v5471.

# boot no multicast mode
Utilizando o "multicast mode" do router é possível bootar uma firmware sem salvar ela na flash.
Isso poderia ser usado para testar uma determinada firmware ou mesmo para se recuperar de bootloop.

Para isso:
1. Desconecte-se de todas as outras redes, fixa, wifi...
2. Fique conectado por cabo de rede em uma porta lan do router.
3. Configure no pc ip fixo 192.168.25.10 / 24 com gateway 192.168.25.1
(na verdade poderia ser qualquer ip...)
4. Deixe fazendo `ping 192.168.25.1` mesmo sem resposta, para manter atividade na rede e não deixar o router sair do "multicast mode" por timeout.
5. Para entrar no "multicast mode" ligue o router segurando o botão wps.
6. Envie a firmware com a ferramenta updatefw:
```
 ./updatefw -r firmware.bin
```
7. Se tudo correr bem o router vai bootar a firmware que foi enviada,
caso contrário ele vai bootar a firmware da flash.

O "multicast mode" não salva a firmware na flash.
Para salvar na flash envie a firmware novamente com o `flash.sh`.

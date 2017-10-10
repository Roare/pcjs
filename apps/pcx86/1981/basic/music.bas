940 REM The IBM Personal Computer Music
950 REM Version 1.00 (C)Copyright IBM Corp 1981
960 REM Licensed Material - Program Property of IBM
975 DEF SEG: POKE 106,0
980 SAMPLES$ = "NO"
990 GOTO 1010
1000 SAMPLES$ = "YES"
1010 KEY OFF:SCREEN 0,1:COLOR 15,0,0:WIDTH 40:CLS:LOCATE 5,19:PRINT "IBM"
1020 LOCATE 7,12,0:PRINT "Personal Computer"
1030 COLOR 10,0:LOCATE 10,9,0:PRINT CHR$(213)+STRING$(21,205)+CHR$(184)
1040 LOCATE 11,9,0:PRINT CHR$(179)+"        MUSIC        "+CHR$(179)
1050 LOCATE 12,9,0:PRINT CHR$(179)+STRING$(21,32)+CHR$(179)
1060 LOCATE 13,9,0:PRINT CHR$(179)+"    Version 1.00     "+CHR$(179)
1070 LOCATE 14,9,0:PRINT CHR$(212)+STRING$(21,205)+CHR$(190)
1080 COLOR 15,0:LOCATE 17,7,0:PRINT "(C) Copyright IBM Corp 1981"
1090 COLOR 14,0:LOCATE 23,7,0:PRINT "Press space bar to continue"
1100 IF INKEY$ <> "" THEN GOTO 1100
1110 CMD$ = INKEY$
1120 IF CMD$ = "" THEN GOTO 1110
1130 IF CMD$ = CHR$(27) THEN GOTO 1850
1140 IF CMD$ <> " " THEN GOTO 1110
1141 ON ERROR GOTO 1148
1142 PLAY "mf"
1143 GOTO 1149
1148 RESUME 1149
1149 ON ERROR GOTO 0
1150 SCREEN 0,1:WIDTH 40:COLOR 15,1,1:CLS
1160 LOCATE 15,7,0:PRINT " ------- selections -------"
1170 LOCATE 16,7,0:PRINT " A-MARCH  E-HUMOR  I-SAKURA"
1180 LOCATE 17,7,0:PRINT " B-STARS  F-BUG    J-BLUE  "
1190 LOCATE 18,7,0:PRINT " C-FORTY  G-POP    K-SCALES"
1191 LOCATE 19,7,0:PRINT " D-HAT    H-DANDY  ESC KEY-EXIT"
1200 COLOR 15,0
1210 FOR I=0 TO 15:FOR J=0 TO 8
1220 LOCATE 5+J,5+I*2,0:PRINT CHR$(219);CHR$(221);
1230 NEXT J:NEXT I
1240 FOR I=0 TO 12:FOR J=0 TO 4
1250 IF I=2 OR I=6 OR I=9 OR I=13 THEN GOTO 1270
1260 LOCATE 5+J,8+I*2:PRINT CHR$(32);CHR$(222);
1270 NEXT J:NEXT I
1280 FOR J=0 TO 9
1290 LOCATE 4+J,4:COLOR 4,0:PRINT CHR$(221);:LOCATE 4+J,36:COLOR 15,0
1300 PRINT CHR$(221);:COLOR 4,1:PRINT CHR$(221);
1310 NEXT J
1320 COLOR 4,1:LOCATE 4,4
1330 FOR I=0 TO 32:PRINT CHR$(219);:NEXT I
1340 PRINT CHR$(221);:LOCATE 13,4
1350 FOR I=0 TO 32:PRINT CHR$(219);:NEXT I
1360 PRINT CHR$(221);:COLOR 0,7:DEFINT M,N,O,P:DIM M(88),O(70)
1370 FOR I=7 TO 88:M(I) =  36.8*(2^(1/12))^(I-6):NEXT I
1380 FOR I=0 TO 6:M(I) = 32767:NEXT I
1390 O(0) = 0
1400 O(39)=5:O(40)=7:O(41)=8:O(42)=9
1410 O(43)=10:O(44)=11:O(45)=13:O(46)=14
1420 O(47)=15:O(48)=16:O(49)=17:O(50)=18
1430 O(51)=19:O(52)=21:O(53)=22:O(54)=23
1440 O(55)=24:O(56)=25:O(57)=27:O(58)=28
1450 O(59)=29:O(60)=30:O(61)=31:O(62)=32
1460 O(63)=33:O(64)=35:O(65)=36:O(66)=37
1470 O(67)=38:O(68)=39:O(69)=40:O(70)=42
1480 GOTO 1630
1490 READ J,K
1500 CMD$ = INKEY$:IF CMD$="" THEN GOTO 1540
1510 IF CMD$=CHR$(27) THEN RETURN
1520 POKE 106,0
1530 REM
1540 IF J = -1  THEN RETURN
1550 Q = O(J)
1560 IF J>64 OR J<39 THEN GOTO 1590
1570 IF SCREEN(5,Q)<>32 THEN COLOR 0,7:LOCATE 11,Q:PRINT CHR$(14);:COLOR 15,0:GOTO 1590
1580 COLOR 15,0:LOCATE 7,Q:PRINT CHR$(14);:COLOR 0,7
1590 SOUND M(J),K:IF J=0 AND K=1 THEN GOTO 1600:'SKIP NEXT FOR STACCATTO
1595 SOUND 32767,1
1600 IF J>64 OR J<39 THEN GOTO 1490
1610 IF SCREEN(5,Q) = 32 THEN COLOR 15,0:LOCATE 7,Q:PRINT CHR$(32);:GOTO 1490
1620 COLOR 15,0:LOCATE 11,Q:PRINT CHR$(219);:GOTO 1490
1630 LOCATE 21,5:PRINT "                                ";
1640 LOCATE 21,5:PRINT "ENTER SELECTION ==>";
1650 IF INKEY$ <> "" THEN GOTO 1650
1660 CMD$=INKEY$:IF CMD$="" THEN GOTO 1660
1670 IF CMD$=CHR$(27)  THEN GOTO 1850
1680 IF CMD$="A" THEN S$= "MARCH ":GOTO 1770
1681 IF CMD$="a" THEN S$= "MARCH ":GOTO 1770
1690 IF CMD$="B" THEN S$= "STARS ":GOTO 1770
1691 IF CMD$="b" THEN S$= "STARS ":GOTO 1770
1700 IF CMD$="C" THEN S$= "FORTY ":GOTO 1770
1701 IF CMD$="c" THEN S$= "FORTY ":GOTO 1770
1710 IF CMD$="D" THEN S$= "HAT   ":GOTO 1770
1711 IF CMD$="d" THEN S$= "HAT   ":GOTO 1770
1720 IF CMD$="E" THEN S$= "HUMOR ":GOTO 1770
1721 IF CMD$="e" THEN S$= "HUMOR ":GOTO 1770
1730 IF CMD$="F" THEN S$= "BUG   ":GOTO 1770
1731 IF CMD$="f" THEN S$= "BUG   ":GOTO 1770
1740 IF CMD$="G" THEN S$= "POP   ":GOTO 1770
1741 IF CMD$="g" THEN S$= "POP   ":GOTO 1770
1750 IF CMD$="H" THEN S$= "DANDY ":GOTO 1770
1751 IF CMD$="h" THEN S$= "DANDY ":GOTO 1770
1755 IF CMD$="I" THEN S$= "SAKURA":GOTO 1770
1756 IF CMD$="i" THEN S$= "SAKURA":GOTO 1770
1757 IF CMD$="J" THEN S$= "BLUE  ":GOTO 1770
1758 IF CMD$="j" THEN S$= "BLUE  ":GOTO 1770
1761 IF CMD$="K" THEN S$= "SCALES":GOTO 1770
1762 IF CMD$="k" THEN S$= "SCALES":GOTO 1770
1769 GOTO 1640
1770 PRINT " ";CMD$;"-";S$:CHAIN MERGE S$,1780,ALL
1780 RESTORE:READ D
1790 IF D<>-2 THEN RESTORE:GOTO 1810
1800 READ S$:LOCATE 23,1+(40.5-LEN(S$))/2
1805 COLOR 15,4:PRINT S$;:COLOR 0,7
1810 GOSUB 1490
1820 S$=STRING$(39," "):LOCATE 23,1:COLOR 4,1:PRINT S$:COLOR 0,7
1830 GOTO 1630
1840 END
1850 IF SAMPLES$="YES" THEN CHAIN "SAMPLES",1000
1860 SCREEN 0,1:COLOR 7,0,0:CLS:END
3000 REM The IBM Personal Computer Music Scroll
3010 REM Version 1.00 (C)Copyright IBM Corp 1981
3020 REM Licensed Material - Program Property of IBM
3030 DATA -2,"FUNERAL MARCH OF A MARIONETTE - GOUNOD"
3040 DATA 37,1,0,2,30,1,0,5,42,3,42,3,41,3,39,3,41,3,0,3,42,3,44,3,0,3,37,1,0,2
3050 DATA 30,1,0,5,42,3,42,3,41,3,39,3,41,3,0,3,42,3,44,3,0,3,37,3,42,3,0,3,45,3
3060 DATA 49,6,47,3,45,3,0,3,49,3,52,6,50,3,49,3,0,3,53,3,56,6,54,3,53,3,50,3
3070 DATA 49,3,47,3,45,3,44,3,30,1,0,5,42,3,42,3,41,3,39,3,41,3,0,3,42,3,44,3
3080 DATA 0,3,37,1,0,2,30,1,0,5,42,3,42,3,41,3,39,3,41,3,0,3,42,3,44,3,0,3
3090 DATA 37,3,45,3,0,3,49,3,52,6,50,3,49,3,47,3,45,3,43,3,47,3,50,3,42,3
3100 DATA 41,3,42,3,44,3,0,3,45,1,0,2,44,9,42,1
3110 DATA -1,-1